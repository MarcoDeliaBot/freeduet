/**
 * The languages `TRANSCRIPTION_LANGUAGE` may name: the two-letter codes in Whisper's own language
 * table, `g_lang` in whisper.cpp's `src/whisper.cpp` at tag v1.9.5. `haw` and `yue` are in that
 * table with three letters and are left out, so what remains is two-letter codes only (ISO 639-1;
 * `jw` is Whisper's own code for Javanese).
 *
 * WHY A LIST AND NOT A PATTERN. whisper.cpp answers an unknown `language` field with a 500 after it
 * has already read the whole recording, so "it-IT" or "italian" would turn every dictation into
 * "Couldn't process this recording". Refusing it at start-up names the setting instead.
 */
export const DICTATION_LANGUAGES: ReadonlySet<string> = new Set(
  (
    "en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th " +
    "ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr " +
    "pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt " +
    "ln ha ba jw su"
  ).split(" "),
);
