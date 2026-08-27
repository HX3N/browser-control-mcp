import { formatScript } from "../format-script";

describe("formatScript", () => {
  it("breaks a one-line script into statements", () => {
    const source =
      'const rows=[...document.querySelectorAll("section")];return rows.map(r=>r.textContent);';
    expect(formatScript(source)).toBe(
      'const rows=[...document.querySelectorAll("section")];\nreturn rows.map(r=>r.textContent);'
    );
  });

  it("indents block bodies and keeps a continuation on the closing brace", () => {
    expect(formatScript("if(a){b();}else{c();}")).toBe(
      "if(a) {\n  b();\n} else {\n  c();\n}"
    );
  });

  it("keeps a call's closing punctuation on the brace line", () => {
    expect(formatScript("run({a:1});")).toBe("run({\n  a:1\n});");
  });

  it("leaves semicolons inside a for header alone", () => {
    expect(formatScript("for(var i=0;i<3;i++){go(i);}")).toBe(
      "for(var i=0;i<3;i++) {\n  go(i);\n}"
    );
  });

  it("does not break on braces or semicolons inside a string", () => {
    expect(formatScript('var s="{a;b}";')).toBe('var s="{a;b}";');
  });

  it("does not break inside a template literal", () => {
    expect(formatScript("var s=`a{b};${x};c`;")).toBe("var s=`a{b};${x};c`;");
  });

  it("keeps a comment's own text intact", () => {
    expect(formatScript("// a; b {\nrun();")).toBe("// a; b {\nrun();");
  });

  it("treats a slash after a value as division, not a regex", () => {
    expect(formatScript("var r=a/b;var t=c/d;")).toBe("var r=a/b;\nvar t=c/d;");
  });

  it("reads a regex literal whole", () => {
    expect(formatScript('var m=t.replace(/[{};]/g,"");')).toBe(
      'var m=t.replace(/[{};]/g, "");'
    );
  });

  it("re-indents code that was already indented wrongly", () => {
    const source = "function f() {\n        return {\n  a: 1\n        };\n}";
    expect(formatScript(source)).toBe("function f() {\n  return {\n    a: 1\n  };\n}");
  });

  it("keeps a chained call glued to its dot", () => {
    expect(formatScript("rows\n  .map(f)\n  .filter(g);")).toBe("rows.map(f).filter(g);");
  });

  it("keeps one blank line between paragraphs", () => {
    expect(formatScript("a();\n\n\n\nb();")).toBe("a();\n\nb();");
  });

  it("writes an empty block as a pair", () => {
    expect(formatScript("try{go();}catch(e){}")).toBe("try {\n  go();\n} catch(e) {}");
  });

  it("leaves an unterminated string alone instead of throwing", () => {
    expect(formatScript('var s="oops;')).toBe('var s="oops;');
  });
});
