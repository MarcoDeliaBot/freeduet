import { useId } from "react";
import type { CSSProperties } from "react";
import type { MascotId } from "../data/freeduetData";

export type MascotMood = "idle" | "listen" | "think" | "work" | "ask" | "done";

interface FreeDuetMascotProps {
  id: MascotId;
  size?: number;
  mood?: MascotMood;
  wave?: boolean;
  showNotes?: boolean;
  showSparkles?: boolean;
  animated?: boolean;
  delay?: number;
  gaze?: { x: number; y: number };
  className?: string;
  label?: string;
}

export const MASCOT_RIGHT_COLOR: Record<MascotId, string> = {
  iris: "#BBA6F0",
  otto: "#F4917A",
  portia: "#9B7BE0",
  penny: "#F6C955",
  jules: "#6EB8F2",
  wren: "#F2A36B",
  mark: "#F27272",
  cam: "#F38CC2",
  rex: "#E5484D",
  gus: "#9AAABF",
  basil: "#8DD46E",
  vera: "#5F8EF0",
  leo: "#F5AE4E",
};

const RIGHT_BROW_COLOR: Record<MascotId, string> = {
  iris: "#8463D0",
  otto: "#C45E46",
  portia: "#6E4BBF",
  penny: "#B78516",
  jules: "#3A7EC2",
  wren: "#BA6830",
  mark: "#BA4444",
  cam: "#BA4F8A",
  rex: "#1E2A55",
  gus: "#5C6D85",
  basil: "#4E9435",
  vera: "#315EC2",
  leo: "#BA781E",
};

function BellyEmblem({ id }: { id: MascotId }) {
  const strokeOut = {
    stroke: "#1E2A55",
    strokeWidth: 8,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const strokeIn = {
    stroke: "#FFFFFF",
    strokeWidth: 4,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "iris":
      return (
        <g>
          <path
            d="M100 150 C92 139 79 139 79 150 C79 161 92 161 100 150 C108 139 121 139 121 150 C121 161 108 161 100 150 Z"
            stroke="#FFFFFF"
            strokeWidth="4.6"
            fill="none"
            strokeLinejoin="round"
          />
          <path
            d="M121 150 L121 132 Q128 134 131 140"
            stroke="#FFFFFF"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="117" cy="152" r="4" fill="#FFFFFF" />
        </g>
      );
    case "otto":
      return (
        <g>
          <rect x="84" y="140" width="32" height="22" rx="3" {...strokeOut} />
          <path d="M85 142 L100 153 L115 142" {...strokeOut} />
          <rect x="84" y="140" width="32" height="22" rx="3" {...strokeIn} />
          <path d="M85 142 L100 153 L115 142" {...strokeIn} />
        </g>
      );
    case "portia":
      return (
        <g>
          <path d="M88 136 L106 136 L113 143 L113 166 L88 166 Z" {...strokeOut} />
          <path d="M94 148 L107 148 M94 156 L103 156" {...strokeOut} />
          <path d="M88 136 L106 136 L113 143 L113 166 L88 166 Z" {...strokeIn} />
          <path d="M94 148 L107 148 M94 156 L103 156" {...strokeIn} />
        </g>
      );
    case "penny":
      return (
        <g>
          <circle cx="100" cy="151" r="15" {...strokeOut} />
          <path
            d="M106 144 Q98 140 94 147 Q91 154 96 158 Q101 162 106 157 M90 149 L101 149 M90 154 L100 154"
            {...strokeOut}
          />
          <circle cx="100" cy="151" r="15" {...strokeIn} />
          <path
            d="M106 144 Q98 140 94 147 Q91 154 96 158 Q101 162 106 157 M90 149 L101 149 M90 154 L100 154"
            {...strokeIn}
          />
        </g>
      );
    case "jules":
      return (
        <g>
          <rect x="84" y="143" width="32" height="22" rx="4" {...strokeOut} />
          <path d="M93 143 L93 137 L107 137 L107 143 M92 149 L92 159 M108 149 L108 159" {...strokeOut} />
          <rect x="84" y="143" width="32" height="22" rx="4" {...strokeIn} />
          <path d="M93 143 L93 137 L107 137 L107 143 M92 149 L92 159 M108 149 L108 159" {...strokeIn} />
        </g>
      );
    case "wren":
      return (
        <g>
          <path d="M88 164 L92 152 L110 134 L117 141 L99 159 Z M88 164 L99 159" {...strokeOut} />
          <path d="M88 164 L92 152 L110 134 L117 141 L99 159 Z M88 164 L99 159" {...strokeIn} />
        </g>
      );
    case "mark":
      return (
        <g>
          <path d="M86 146 L86 156 L94 156 L112 166 L112 136 L94 146 Z" {...strokeOut} />
          <path d="M118 144 Q122 151 118 158" {...strokeOut} />
          <path d="M86 146 L86 156 L94 156 L112 166 L112 136 L94 146 Z" {...strokeIn} />
          <path d="M118 144 Q122 151 118 158" {...strokeIn} />
        </g>
      );
    case "cam":
      return (
        <g>
          <rect x="84" y="145" width="32" height="20" rx="2" {...strokeOut} />
          <path d="M84 145 L86 136 L116 136 L116 145 M94 136 L91 145 M104 136 L101 145" {...strokeOut} />
          <rect x="84" y="145" width="32" height="20" rx="2" {...strokeIn} />
          <path d="M84 145 L86 136 L116 136 L116 145 M94 136 L91 145 M104 136 L101 145" {...strokeIn} />
        </g>
      );
    case "rex":
      return (
        <g>
          <path d="M82 150 L118 150" {...strokeOut} />
          <path d="M80 140 L80 160 M86 143 L86 157 M114 143 L114 157 M120 140 L120 160" {...strokeOut} />
          <path d="M82 150 L118 150" {...strokeIn} />
          <path d="M80 140 L80 160 M86 143 L86 157 M114 143 L114 157 M120 140 L120 160" {...strokeIn} />
        </g>
      );
    case "gus":
      return (
        <g>
          <path d="M89 164 L104 149" {...strokeOut} />
          <path d="M104 149 A10 10 0 1 1 116 140 L109 140 L106 137 L106 131 A10 10 0 0 0 104 149 Z" {...strokeOut} />
          <path d="M89 164 L104 149" {...strokeIn} />
          <path d="M104 149 A10 10 0 1 1 116 140 L109 140 L106 137 L106 131 A10 10 0 0 0 104 149 Z" {...strokeIn} />
        </g>
      );
    case "basil":
      return (
        <g>
          <path d="M84 150 L116 150 Q116 166 100 166 Q84 166 84 150 Z" {...strokeOut} />
          <path d="M100 146 Q104 134 114 134 Q112 144 100 146" {...strokeOut} />
          <path d="M84 150 L116 150 Q116 166 100 166 Q84 166 84 150 Z" {...strokeIn} />
          <path d="M100 146 Q104 134 114 134 Q112 144 100 146" {...strokeIn} />
        </g>
      );
    case "vera":
      return (
        <g>
          <circle cx="97" cy="148" r="11" {...strokeOut} />
          <path d="M105 156 L115 166 M92 148 L96 152 L103 144" {...strokeOut} />
          <circle cx="97" cy="148" r="11" {...strokeIn} />
          <path d="M105 156 L115 166 M92 148 L96 152 L103 144" {...strokeIn} />
        </g>
      );
    case "leo":
      return (
        <g>
          <rect x="84" y="150" width="16" height="15" rx="2" {...strokeOut} />
          <rect x="100" y="150" width="16" height="15" rx="2" {...strokeOut} />
          <rect x="92" y="135" width="16" height="15" rx="2" {...strokeOut} strokeDasharray="4 4" />
          <rect x="84" y="150" width="16" height="15" rx="2" {...strokeIn} />
          <rect x="100" y="150" width="16" height="15" rx="2" {...strokeIn} />
          <rect x="92" y="135" width="16" height="15" rx="2" {...strokeIn} strokeDasharray="4 4" />
        </g>
      );
  }
}

function MascotFace({
  id,
  mood,
  rightBrow,
  gx,
  gy,
}: {
  id: MascotId;
  mood: MascotMood;
  rightBrow: string;
  gx: number;
  gy: number;
}) {
  const pupilTransform = gx || gy ? `translate(${gx.toFixed(1)} ${gy.toFixed(1)})` : undefined;

  if (mood === "done") {
    return (
      <g>
        <path d="M68 106 Q80 90 92 106" stroke="#1E2A55" strokeWidth="5.2" fill="none" strokeLinecap="round" />
        <path d="M108 106 Q120 90 132 106" stroke="#1E2A55" strokeWidth="5.2" fill="none" strokeLinecap="round" />
        <path d="M67 99 L61 94" stroke="#1E2A55" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M133 99 L139 94" stroke="#1E2A55" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M72 80 Q80 73 88 80" stroke="#2A9FA3" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M112 80 Q120 73 128 80" stroke={rightBrow} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <ellipse cx="65" cy="122" rx="10" ry="5.5" fill="#F59DB4" opacity="0.92" />
        <ellipse cx="135" cy="122" rx="10" ry="5.5" fill="#F59DB4" opacity="0.92" />
        <path
          d="M90 116 Q100 131 110 116 Z"
          fill="#E5628D"
          stroke="#1E2A55"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  if (mood === "think") {
    return (
      <g>
        <path
          d="M69 107 Q79 91 89 107 Q79 114 69 107 Z"
          fill="#F8FBFF"
          stroke="#1E2A55"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="M111 107 Q121 91 131 107 Q121 114 111 107 Z"
          fill="#F8FBFF"
          stroke="#1E2A55"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <g transform={pupilTransform}>
          <circle cx="82" cy="103" r="3.6" fill="#1E2A55" />
          <circle cx="124" cy="103" r="3.6" fill="#1E2A55" />
          <circle cx="83.2" cy="101.5" r="1.2" fill="#FFFFFF" />
          <circle cx="125.2" cy="101.5" r="1.2" fill="#FFFFFF" />
        </g>
        <path d="M68 88 H90" stroke="#2A9FA3" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M110 85 Q121 81 132 86" stroke={rightBrow} strokeWidth="3.6" strokeLinecap="round" fill="none" />
        <ellipse cx="66" cy="123" rx="8.5" ry="4.6" fill="#F59DB4" opacity="0.65" />
        <ellipse cx="134" cy="123" rx="8.5" ry="4.6" fill="#F59DB4" opacity="0.65" />
        <path d="M95 123 Q100 120 106 123" stroke="#B5386A" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    );
  }

  if (mood === "work") {
    return (
      <g>
        <ellipse cx="79" cy="106" rx="10" ry="9" fill="#F8FBFF" stroke="#1E2A55" strokeWidth="2.8" />
        <ellipse cx="121" cy="106" rx="10" ry="9" fill="#F8FBFF" stroke="#1E2A55" strokeWidth="2.8" />
        <g className="fd-scan">
          <circle cx="80" cy="109" r="4.5" fill="#1E2A55" />
          <circle cx="122" cy="109" r="4.5" fill="#1E2A55" />
          <circle cx="81.6" cy="107.2" r="1.5" fill="#FFFFFF" />
          <circle cx="123.6" cy="107.2" r="1.5" fill="#FFFFFF" />
        </g>
        <path d="M70 86 L89 90" stroke="#2A9FA3" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M130 86 L111 90" stroke={rightBrow} strokeWidth="3.4" strokeLinecap="round" />
        <ellipse cx="66" cy="123" rx="8.5" ry="4.8" fill="#F59DB4" opacity="0.72" />
        <ellipse cx="134" cy="123" rx="8.5" ry="4.8" fill="#F59DB4" opacity="0.72" />
        <path d="M93 121 H107" stroke="#B5386A" strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }

  if (mood === "ask") {
    return (
      <g>
        <g className="fd-eyes">
          <ellipse cx="79" cy="105" rx="10.2" ry="11.2" fill="#F8FBFF" stroke="#1E2A55" strokeWidth="2.8" />
          <ellipse cx="121" cy="105" rx="10.2" ry="11.2" fill="#F8FBFF" stroke="#1E2A55" strokeWidth="2.8" />
          <g transform={pupilTransform}>
            <circle cx="79.5" cy="103.5" r="5.2" fill="#1E2A55" />
            <circle cx="121.5" cy="103.5" r="5.2" fill="#1E2A55" />
            <circle cx="81.4" cy="101" r="2" fill="#FFFFFF" />
            <circle cx="123.4" cy="101" r="2" fill="#FFFFFF" />
          </g>
        </g>
        <path d="M69 83 Q79 75 89 83" stroke="#2A9FA3" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M111 81 Q121 73 131 81" stroke={rightBrow} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <ellipse cx="66" cy="123" rx="9" ry="5" fill="#F59DB4" opacity="0.82" />
        <ellipse cx="134" cy="123" rx="9" ry="5" fill="#F59DB4" opacity="0.82" />
        <ellipse cx="100" cy="122" rx="4.5" ry="5" fill="#EC7A9E" stroke="#1E2A55" strokeWidth="2.3" />
      </g>
    );
  }

  // "idle" & "listen" — signature big luminous official freeduet.com kawaii eyes
  const rx = mood === "listen" ? 12.6 : 11.5;
  const ry = mood === "listen" ? 14.5 : 13.5;

  return (
    <g>
      <g className="fd-eyes">
        <g transform={pupilTransform}>
          <ellipse cx="80" cy="104" rx={rx} ry={ry} fill="#1E2A55" />
          <circle cx="84.2" cy="98.2" r="4.3" fill="#FFFFFF" />
          <circle cx="76" cy="109.2" r="1.9" fill="#FFFFFF" />
          <ellipse cx="120" cy="104" rx={rx} ry={ry} fill="#1E2A55" />
          <circle cx="124.2" cy="98.2" r="4.3" fill="#FFFFFF" />
          <circle cx="116" cy="109.2" r="1.9" fill="#FFFFFF" />
        </g>
        <path d="M68 99 L63 95" stroke="#1E2A55" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M132 99 L137 95" stroke="#1E2A55" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      <ellipse cx="66" cy="123" rx="9" ry="5" fill="#F59DB4" opacity="0.78" />
      <ellipse cx="134" cy="123" rx="9" ry="5" fill="#F59DB4" opacity="0.78" />

      {id === "rex" ? (
        <>
          <path d="M72 80 L88 84" stroke="#1E2A55" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M112 84 L128 80" stroke="#1E2A55" strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path
            d={mood === "listen" ? "M72 79 Q80 73 88 79" : "M72 82 Q80 77 88 82"}
            stroke="#2A9FA3"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={mood === "listen" ? "M112 79 Q120 73 128 79" : "M112 82 Q120 77 128 82"}
            stroke={rightBrow}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}

      <path
        d={mood === "listen" ? "M92 119 Q100 128 108 119" : "M93 119 Q100 126 107 119"}
        stroke="#B5386A"
        strokeWidth="3.1"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Official FreeDuet split-color mascot extracted faithfully from freeduet.com
 * for all 13 characters (Iris, Otto, Portia, Penny, Jules, Wren, Mark, Cam,
 * Rex, Gus, Basil, Vera, Leo), enhanced with full 6-mood character acting,
 * subtle eye-tracking gaze, independent antenna/headphone/arm motion rig,
 * thinking bubbles, and musical-duet notes & sound waves.
 */
export function FreeDuetMascot({
  id,
  size = 120,
  mood = "idle",
  wave = false,
  showNotes = false,
  showSparkles = false,
  animated = true,
  delay = 0,
  gaze,
  className = "",
  label,
}: FreeDuetMascotProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `fd-c-${id}-${uid}`;
  const right = MASCOT_RIGHT_COLOR[id];
  const rightBrow = RIGHT_BROW_COLOR[id];
  const gx = gaze ? Math.max(-3.2, Math.min(3.2, gaze.x)) : 0;
  const gy = gaze ? Math.max(-2.6, Math.min(2.6, gaze.y)) : 0;

  const style = {
    "--fd-delay": `${delay}s`,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <svg
      viewBox="0 0 220 220"
      style={style}
      className={`fd-mascot ${animated ? "is-anim" : ""} mood-${mood} ${wave || mood === "ask" ? "is-waving" : ""} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M100 38 C138 38 156 64 156 96 C156 116 166 130 164 150 C162 174 134 182 100 182 C66 182 38 174 36 150 C34 130 44 116 44 96 C44 64 62 38 100 38 Z" />
        </clipPath>
      </defs>

      {/* Ambient floating duet notes + headphone wave arcs */}
      {(showNotes || mood === "listen" || mood === "done") && (
        <g className="fd-notes" aria-hidden="true">
          <g className="fd-note fd-note-1">
            <path d="M30 52 L30 32 Q38 34 40 40" stroke="#1B4FD8" strokeWidth="3" fill="none" strokeLinecap="round" />
            <ellipse cx="25" cy="52" rx="5.2" ry="3.8" transform="rotate(-18 25 52)" fill="#4FD3D6" />
          </g>
          <g className="fd-note fd-note-2">
            <path
              d="M188 52 L188 30 L201 26 L201 46"
              stroke={right}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="183" cy="52" r="4.2" fill={right} />
            <circle cx="196" cy="46" r="4.2" fill="#4FD3D6" />
          </g>
          <g className="fd-sound fd-sound-l" stroke="#4FD3D6" strokeWidth="2.8" fill="none" strokeLinecap="round">
            <path d="M25 98 Q17 110 25 122" />
            <path d="M16 90 Q5 110 16 130" opacity="0.55" />
          </g>
          <g className="fd-sound fd-sound-r" stroke={right} strokeWidth="2.8" fill="none" strokeLinecap="round">
            <path d="M195 98 Q203 110 195 122" />
            <path d="M204 90 Q215 110 204 130" opacity="0.55" />
          </g>
        </g>
      )}

      {/* Think bubble choreography */}
      {mood === "think" && (
        <g className="fd-think-bubbles" aria-hidden="true">
          <circle cx="174" cy="60" r="4.5" fill="#FFFFFF" stroke="#1E2A55" strokeWidth="2.2" />
          <circle cx="187" cy="44" r="7" fill="#FFFFFF" stroke="#1E2A55" strokeWidth="2.2" />
          <circle cx="201" cy="24" r="10.5" fill="#FFFFFF" stroke={right} strokeWidth="2.5" />
          <circle cx="198" cy="24" r="1.8" fill="#1E2A55" />
          <circle cx="204" cy="24" r="1.8" fill="#1E2A55" />
        </g>
      )}

      {/* Celebration star sparkles */}
      {(showSparkles || mood === "done") && (
        <g className="fd-cheer-sparks" aria-hidden="true">
          <path
            className="fd-sp fd-sp-1"
            d="M36 74 L39 81 L46 84 L39 87 L36 94 L33 87 L26 84 L33 81 Z"
            fill="#F6C955"
          />
          <path
            className="fd-sp fd-sp-2"
            d="M188 72 L191 78 L197 81 L191 84 L188 90 L185 84 L179 81 L185 78 Z"
            fill="#4FD3D6"
          />
          <circle className="fd-sp fd-sp-3" cx="170" cy="46" r="4" fill={right} />
        </g>
      )}

      <g transform="translate(10 10)">
        {/* Synced ground contact shadow */}
        <ellipse className="fd-shadow" cx="100" cy="194" rx="56" ry="5.5" fill="#1E2A55" opacity="0.11" />

        {/* Full jelly bouncy body rig */}
        <g className="fd-body-rig">
          {/* Left official musical-note antenna (aqua) */}
          <g className="fd-ant-l">
            <path d="M84 44 L74 22" stroke="#1E2A55" strokeWidth="8" strokeLinecap="round" />
            <path d="M84 44 L74 22" stroke="#4FD3D6" strokeWidth="4" strokeLinecap="round" />
            <path
              d="M75 20 L75 4 Q82 8 83 14"
              stroke="#1E2A55"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M75 20 L75 4 Q82 8 83 14"
              stroke="#4FD3D6"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="70" cy="20" r="6" fill="#4FD3D6" stroke="#1E2A55" strokeWidth="2.5" />
          </g>

          {/* Right official musical-note antenna (member color) */}
          <g className="fd-ant-r">
            <path d="M116 44 L126 22" stroke="#1E2A55" strokeWidth="8" strokeLinecap="round" />
            <path d="M116 44 L126 22" stroke={right} strokeWidth="4" strokeLinecap="round" />
            <path
              d="M129 20 L129 4 Q136 8 137 14"
              stroke="#1E2A55"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M129 20 L129 4 Q136 8 137 14"
              stroke={right}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="124" cy="20" r="6" fill={right} stroke="#1E2A55" strokeWidth="2.5" />
          </g>

          {/* Rounded little feet */}
          <ellipse cx="78" cy="184" rx="17" ry="10" fill="#4FD3D6" stroke="#1E2A55" strokeWidth="4" />
          <ellipse cx="122" cy="184" rx="17" ry="10" fill={right} stroke="#1E2A55" strokeWidth="4" />

          {/* Independent left & right waving arms */}
          <g className="fd-arm-l">
            <ellipse
              cx="38"
              cy="134"
              rx="11"
              ry="18"
              transform="rotate(22 38 134)"
              fill="#4FD3D6"
              stroke="#1E2A55"
              strokeWidth="4"
            />
          </g>
          <g className="fd-arm-r">
            <ellipse
              cx="162"
              cy="134"
              rx="11"
              ry="18"
              transform="rotate(-22 162 134)"
              fill={right}
              stroke="#1E2A55"
              strokeWidth="4"
            />
          </g>

          {/* Official split aqua / specialist accent body */}
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="100" height="200" fill="#4FD3D6" />
            <rect x="100" y="0" width="100" height="200" fill={right} />
            {/* Soft sunlit top sheen */}
            <ellipse cx="72" cy="58" rx="23" ry="10" transform="rotate(-18 72 58)" fill="#FFFFFF" opacity="0.3" />
            <ellipse cx="132" cy="63" rx="15" ry="7" transform="rotate(14 132 63)" fill="#FFFFFF" opacity="0.2" />
            {/* Subtle luminous seam ribbon down middle */}
            <rect x="99" y="38" width="2" height="146" fill="#FFFFFF" opacity="0.16" />
          </g>

          {/* Signature navy silhouette outline */}
          <path
            d="M100 38 C138 38 156 64 156 96 C156 116 166 130 164 150 C162 174 134 182 100 182 C66 182 38 174 36 150 C34 130 44 116 44 96 C44 64 62 38 100 38 Z"
            fill="none"
            stroke="#1E2A55"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />

          {/* Official character expression */}
          <MascotFace id={id} mood={mood} rightBrow={rightBrow} gx={gx} gy={gy} />

          {/* Official belly role emblem */}
          <BellyEmblem id={id} />

          {/* Signature FreeDuet headphones */}
          <g className="fd-headset">
            <path d="M46 96 C44 30 156 30 154 96" stroke="#1E2A55" strokeWidth="13" fill="none" strokeLinecap="round" />
            <path d="M46 96 C44 30 156 30 154 96" stroke="#8C9CF0" strokeWidth="7" fill="none" strokeLinecap="round" />
            <rect x="30" y="82" width="22" height="38" rx="10" fill="#5BB4E6" stroke="#1E2A55" strokeWidth="3.5" />
            <rect x="148" y="82" width="22" height="38" rx="10" fill="#A28BEE" stroke="#1E2A55" strokeWidth="3.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}
