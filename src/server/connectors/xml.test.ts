import { describe, it, expect } from "vitest";
import {
  decodeXmlEntities,
  readAttr,
  readTag,
  splitBlocks,
  stripCdata,
} from "./xml";

describe("xml helpers", () => {
  it("decodes the 5 XML entities + numeric refs", () => {
    expect(decodeXmlEntities("Tom &amp; Jerry &lt;3 &quot;hi&quot; &#233;")).toBe(
      'Tom & Jerry <3 "hi" é',
    );
  });

  it("strips CDATA wrapping", () => {
    expect(stripCdata("<![CDATA[hello]]>")).toBe("hello");
    expect(stripCdata("no cdata")).toBe("no cdata");
  });

  it("readTag finds the first child tag content", () => {
    const xml = "<item><title>Hello</title><link>https://x</link></item>";
    expect(readTag(xml, "title")).toBe("Hello");
    expect(readTag(xml, "link")).toBe("https://x");
    expect(readTag(xml, "missing")).toBeNull();
  });

  it("readTag handles CDATA and namespaced tags", () => {
    const xml = "<item><dc:date>2026-05-01</dc:date><title><![CDATA[Bar]]></title></item>";
    expect(readTag(xml, "date")).toBe("2026-05-01");
    expect(readTag(xml, "title")).toBe("Bar");
  });

  it("readAttr extracts an attribute value", () => {
    const xml = '<enclosure url="https://img/1.jpg" length="100" />';
    expect(readAttr(xml, "enclosure", "url")).toBe("https://img/1.jpg");
    expect(readAttr(xml, "enclosure", "length")).toBe("100");
    expect(readAttr(xml, "enclosure", "missing")).toBeNull();
  });

  it("splitBlocks returns every outer-match", () => {
    const xml = "<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>";
    const blocks = splitBlocks(xml, "url");
    expect(blocks).toHaveLength(2);
    expect(readTag(blocks[0]!, "loc")).toBe("a");
    expect(readTag(blocks[1]!, "loc")).toBe("b");
  });

  it("splitBlocks handles attributes on the opening tag", () => {
    const xml = '<urlset><url priority="0.5"><loc>x</loc></url></urlset>';
    expect(splitBlocks(xml, "url")).toHaveLength(1);
  });
});
