from pathlib import Path

p = Path("src/renderer/app.js")
text = p.read_text()

# ------------------------------------------------------------
# 1. Add helper that extracts literal output filenames
# ------------------------------------------------------------

marker = "async function renderRootOutputs(){"

if marker not in text:
    raise SystemExit("Could not find renderRootOutputs()")

if "function extractExplicitOutputNames(" not in text:
    helper = r"""
function extractExplicitOutputNames(source){
  const names=new Set();

  const patterns=[
    // Python:
    // plt.savefig("plot.png")
    // fig.savefig("plot.pdf")
    /(?:savefig|imsave)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi,

    // ROOT / C++:
    // c->SaveAs("plot.pdf")
    // c->Print("plot.png")
    /(?:SaveAs|Print)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi,

    // R:
    // ggsave("plot.pdf")
    // png("plot.png")
    // pdf("plot.pdf")
    /(?:ggsave|png|pdf|jpeg|jpg)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi
  ];

  for(const pattern of patterns){
    let match;

    while((match=pattern.exec(source||''))!==null){
      const pieces=match[2].split(/[\\/]/);
      const name=pieces[pieces.length-1];

      if(name)names.add(name);
    }
  }

  return [...names];
}

"""
    text = text.replace(marker, helper + marker, 1)


# ------------------------------------------------------------
# 2. Make gallery show only filenames explicitly named in code
#    when such filenames exist.
# ------------------------------------------------------------

old = """  const outputs =
    await window.workbench.generatedOutputs({
      path: currentPath,
      sinceMs: lastRunStartedAt.get(currentPath) || 0
    });"""

new = r"""  const explicitNames=
    extractExplicitOutputNames(editor.value||'');

  const allOutputs=
    await window.workbench.generatedOutputs({
      path:currentPath,
      sinceMs:0
    });

  let outputs=[];

  if(explicitNames.length){
    const wanted=new Set(explicitNames);

    outputs=allOutputs.filter(item=>
      wanted.has(item.name)
    );
  }else{
    // Dynamic filenames cannot be known from the source alone.
    // Fall back to outputs modified during the latest Workbench run.
    const sinceMs=
      lastRunStartedAt.get(currentPath)||0;

    if(sinceMs){
      outputs=allOutputs.filter(item=>
        item.mtimeMs>=sinceMs
      );
    }
  }"""

if old in text:
    text = text.replace(old, new, 1)
elif "const explicitNames=" not in text:
    raise SystemExit("Could not find output lookup inside renderRootOutputs()")


# ------------------------------------------------------------
# 3. Replace generic code-file gallery decision
# ------------------------------------------------------------

refresh_start = text.find("async function refreshPreview(){")
if refresh_start == -1:
    raise SystemExit("Could not find refreshPreview()")

start = text.find("  if(isPlotProducingCode){", refresh_start)

end_marker = "\n  const info=await window.workbench.fileInfo(currentPath);"
end = text.find(end_marker, start)

if start == -1 or end == -1:
    raise SystemExit("Could not find plot-producing-code block")

new_block = r"""  if(isPlotProducingCode){
    try{
      const explicitNames=
        extractExplicitOutputNames(editor.value||'');

      const outputs=
        await window.workbench.generatedOutputs({
          path:currentPath,
          sinceMs:0
        });

      const existingNames=
        new Set(outputs.map(item=>item.name));

      const hasExplicitOutput=
        explicitNames.some(name=>
          existingNames.has(name)
        );

      const sinceMs=
        lastRunStartedAt.get(currentPath)||0;

      const hasRecentOutput=
        !!sinceMs &&
        outputs.some(item=>
          item.mtimeMs>=sinceMs
        );

      // ROOT uses the generated-output pane by default.
      //
      // Python, R, C and C++ use it when:
      // 1. the source explicitly names an existing plot file, or
      // 2. a recent Workbench run produced a plot with a dynamic name.
      if(
        isRootMacro ||
        hasExplicitOutput ||
        hasRecentOutput
      ){
        preview.removeAttribute('src');
        preview.srcdoc=await renderRootOutputs();
        return;
      }
    }catch{}
  }"""

text = text[:start] + new_block + text[end:]

p.write_text(text)

print("Source-aware plot matching installed.")
