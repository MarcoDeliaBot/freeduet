# How many threads whisper-server gets (docs/M1_PLAN.md D25). Sourced by entrypoint.sh.
#
# whisper.cpp's server uses min(4, hardware threads) unless told otherwise (examples/server/server.cpp:73
# at v1.9.5), which leaves most of a bigger computer idle. `nproc` counts hardware threads, usually two
# per core, so half of it is about the physical cores. At least 4 (the server's own number) and at most
# 16 (past that, whisper.cpp's CPU code stops getting faster for one request).
#   whisper_threads <hardware threads> [<WHISPER_THREADS, may be empty>]
# Prints the number, or a sentence on stderr and returns 1 when the override is not a whole number >= 1.
whisper_threads() {
  cpus="$1"
  override="${2:-}"
  if [ -n "$override" ]; then
    case "$override" in
      *[!0-9]* | 0*)
        echo "WHISPER_THREADS must be a whole number of 1 or more." >&2
        return 1
        ;;
    esac
    echo "$override"
    return 0
  fi
  threads=$((cpus / 2))
  [ "$threads" -lt 4 ] && threads=4
  [ "$threads" -gt 16 ] && threads=16
  echo "$threads"
}

# whisper_beam_args <WHISPER_BEAM_SIZE, may be empty>: the option, or nothing. Unset leaves the server's
# own decoding, which is greedy (beam_size -1, server.cpp:82; greedy chosen unless beam_size > 1, :927).
whisper_beam_args() {
  size="${1:-}"
  [ -z "$size" ] && return 0
  case "$size" in
    *[!0-9]* | 0* | 1)
      echo "WHISPER_BEAM_SIZE must be a whole number of 2 or more (leave it empty for greedy decoding)." >&2
      return 1
      ;;
  esac
  echo "--beam-size $size"
}
