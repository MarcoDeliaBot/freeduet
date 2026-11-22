import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPythonMirror } from "../src/approvals/safety-words";

/** D131: regenerates the Python mirror of the fixed rule's other-language words. */
const target = join(
  import.meta.dir,
  "../../agent-freeduet/freeduet/safety_words_gen.py",
);
writeFileSync(target, renderPythonMirror());
console.log(`wrote ${target}`);
