"""Deterministic, self-contained SVG scenes for the living GitHub study.

No network access or external dependencies. Weather fetching and phase selection
belong to the caller; SVG animation is decorative and respects reduced motion.
"""
from html import escape
import math
import re


# The furniture stays familiar through the day. Only the room, view, and light
# change. Each palette keeps small metadata readable against the room wall.
_PALETTES = {
    "night": {
        "ROOM_START": "#152337", "ROOM_END": "#1D3047",
        "SKY_START": "#203B56", "SKY_END": "#29445C",
        "FRAME": "#101D2D", "TRIM": "#50647A", "SILL": "#677A8D",
        "CITY_FAR": "#1B3249", "CITY_NEAR": "#12273D",
        "INK": "#F4ECDE", "MUTED": "#A2B2C3", "SECONDARY": "#ADBCCB",
        "SMALL": "#9BAEC1", "DESK_LEGS": "#2B3D52",
        "CLOUD": "#71859B", "CELESTIAL": "#E0DECF",
        "CITY_LIGHT": "#E9B76F", "CITY_LIGHT_SECONDARY": "#CFDCCF",
        "CITY_LIGHT_OPACITY": ".7", "LAMP_EDGE": "#F4DCA7",
        "CAT": "#BA9B82", "CAT_DARK": "#826A5C", "CAT_FACE": "#332C2A",
    },
    "dusk": {
        "ROOM_START": "#413B4B", "ROOM_END": "#59464B",
        "SKY_START": "#746386", "SKY_END": "#E8A783",
        "FRAME": "#302E3D", "TRIM": "#887B88", "SILL": "#A69A9E",
        "CITY_FAR": "#655F78", "CITY_NEAR": "#454657",
        "INK": "#FFF1DD", "MUTED": "#D1BEC9", "SECONDARY": "#E1CDD0",
        "SMALL": "#C7B9C4", "DESK_LEGS": "#383341",
        "CLOUD": "#B9A0AE", "CELESTIAL": "#FFD4A0",
        "CITY_LIGHT": "#F5D69A", "CITY_LIGHT_SECONDARY": "#E8D3C2",
        "CITY_LIGHT_OPACITY": ".55", "LAMP_EDGE": "#F4DCA7",
        "CAT": "#CFAC8D", "CAT_DARK": "#947967", "CAT_FACE": "#42332D",
    },
    "dawn": {
        "ROOM_START": "#EDE4DE", "ROOM_END": "#DBD5D7",
        "SKY_START": "#A9BACF", "SKY_END": "#F4CCAE",
        "FRAME": "#9D9BA6", "TRIM": "#C3B5B2", "SILL": "#9B8F91",
        "CITY_FAR": "#A29FAF", "CITY_NEAR": "#7D8195",
        "INK": "#354257", "MUTED": "#5D6271", "SECONDARY": "#586071",
        "SMALL": "#636676", "DESK_LEGS": "#8A8792",
        "CLOUD": "#FFF0DF", "CELESTIAL": "#FFE5BC",
        "CITY_LIGHT": "#E4D5BE", "CITY_LIGHT_SECONDARY": "#C8CDD0",
        "CITY_LIGHT_OPACITY": ".45", "LAMP_EDGE": "#B69670",
        "CAT": "#B89174", "CAT_DARK": "#8A6A58", "CAT_FACE": "#3F332D",
    },
    "day": {
        "ROOM_START": "#E7EDEB", "ROOM_END": "#D5E0E2",
        "SKY_START": "#95BDD4", "SKY_END": "#D5E7EC",
        "FRAME": "#8D9DA6", "TRIM": "#B9C8CD", "SILL": "#8197A2",
        "CITY_FAR": "#93ACBC", "CITY_NEAR": "#718B9F",
        "INK": "#2F4255", "MUTED": "#566778", "SECONDARY": "#52677A",
        "SMALL": "#5C6E7D", "DESK_LEGS": "#8297A4",
        "CLOUD": "#F5F6F0", "CELESTIAL": "#FFE7AA",
        "CITY_LIGHT": "#B5CED9", "CITY_LIGHT_SECONDARY": "#C1D4DB",
        "CITY_LIGHT_OPACITY": ".55", "LAMP_EDGE": "#B69670",
        "CAT": "#BC9679", "CAT_DARK": "#8B6D5A", "CAT_FACE": "#3F332D",
    },
}

_EXTRA_CSS = """
      .snow{fill:#F1F3EF;animation:snow-fall 13s linear infinite}
      .snow-b{animation-duration:17s;animation-delay:-7s;opacity:.55}
      .clouds{animation:cloud-drift 28s ease-in-out infinite}
      .mist{animation:mist-drift 22s ease-in-out infinite}
      .cat-tail{transform-box:view-box;transform-origin:685px 207px;animation:tail-sway 11s ease-in-out infinite}
      .cat-head{transform-box:view-box;transform-origin:661px 203px;animation:cat-nod 18s ease-in-out infinite}
      .cat-eyes{transform-box:fill-box;transform-origin:center;animation:cat-blink 8.7s linear infinite}
      @keyframes snow-fall{from{transform:translate(-4px,-65px)}to{transform:translate(7px,75px)}}
      @keyframes cloud-drift{0%,100%{transform:translateX(-3px)}50%{transform:translateX(4px)}}
      @keyframes mist-drift{0%,100%{transform:translateX(-5px);opacity:.35}50%{transform:translateX(5px);opacity:.52}}
      @keyframes tail-sway{0%,76%,100%{transform:rotate(0deg)}84%{transform:rotate(-7deg)}92%{transform:rotate(3deg)}}
      @keyframes cat-nod{0%,82%,100%{transform:rotate(0deg)}89%,94%{transform:rotate(-3deg)}}
      @keyframes cat-blink{0%,91%,95%,100%{transform:scaleY(1)}93%{transform:scaleY(.08)}}
      @DAY_CSS@
"""

_CAT = """<g id="window-cat" aria-label="A little cat resting on the window sill">
    <path class="cat-tail" d="M683 207q9-5 4-18" fill="none" stroke="@CAT_DARK@" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="676" cy="204" rx="15" ry="8" fill="@CAT@"/>
    <path d="M670 199q3 4 1 9m7-11q3 4 1 8" fill="none" stroke="@CAT_DARK@" stroke-width="2" opacity=".45"/>
    <g class="cat-head">
      <path d="M651 195l1-12 8 7 7-7 4 13Z" fill="@CAT@"/>
      <path d="M654 191v-4l4 4m7 0 2-4 1 5" fill="none" stroke="#DCB3A3" stroke-width="2"/>
      <ellipse cx="661" cy="198" rx="11" ry="9" fill="@CAT@"/>
      <g class="cat-eyes" fill="@CAT_FACE@"><ellipse cx="657" cy="198" rx="1.05" ry="1.25"/><ellipse cx="665" cy="198" rx="1.05" ry="1.25"/></g>
      <path d="M660 202h2l-1 1Z" fill="@CAT_FACE@"/>
      <path d="M653 201l-5-1m5 3-5 1m20-3 5-1m-5 3 5 1" stroke="@CAT_FACE@" stroke-width=".65" opacity=".5"/>
    </g>
    <path d="M659 210h10m7 0h9" stroke="@CAT@" stroke-width="5" stroke-linecap="round"/>
  </g>"""

_RAIN = """<g class="rain"><path d="M614 9l-2 14m52 14-2 18m56-57-2 14m66 25-2 19m47-40-2 15M631 104l-2 16m62-23-2 20m46 30-2 15m66-63-2 17m34 26-2 15M612 203l-2 14m52 14-2 18m56-57-2 14m66 25-2 19m47-40-2 15"/></g>
    <g class="rain rain-b"><path d="M641 5l-2 20m46 22-2 16m61-40-2 20m66 12-2 16M612 93l-2 20m46 22-2 16m61-40-2 20m66 12-2 16m43 27-2 18M641 195l-2 20m46 22-2 16m61-40-2 20m66 12-2 16"/></g>
    <g class="rain rain-c"><path d="M622-29l-1 10m52 7-1 11m91-7-1 12m61-28-1 12M638 67l-1 10m52 7-1 11m70-28-1 12m61 1-1 12M622 168l-1 10m52 7-1 11m91-7-1 12m61-28-1 12"/></g>"""


def _fill(template, values):
    """Replace only template tokens, never tokens occurring in supplied text."""
    return re.sub(r"@([A-Z_]+)@", lambda match: values[match.group(1)], template)


def _context(scene):
    phase = scene.get("phase", "night")
    weather = scene.get("weather", "clear")
    if phase not in _PALETTES:
        raise ValueError("Unknown scene phase: %r" % phase)
    if weather not in {"clear", "cloud", "rain", "snow", "fog", "storm"}:
        raise ValueError("Unknown weather bucket: %r" % weather)
    temperature = float(scene["temperature_c"])
    if not math.isfinite(temperature):
        raise ValueError("temperature_c must be finite")
    values = dict(_PALETTES[phase])
    city = str(scene.get("city", "New York"))
    weather_label = str(scene.get("weather_label", weather.title()))
    observed = str(scene.get("observed_label", ""))
    values["WEATHER_LINE"] = escape("%s · %d°C · %s" % (city, round(temperature), weather_label))
    values["UPDATED_LINE"] = escape("Weather data · " + observed) if observed else ""
    values["TITLE"] = escape("TianLu-hub — %s in the study" % phase)
    values["DESCRIPTION"] = escape(
        "A quiet %s study overlooking %s. %s, %.0f degrees Celsius. "
        "A cat rests on the window sill beside books, a lamp, and warm coffee. "
        "Weather observed %s." % (phase, city, weather_label, temperature, observed or "at the latest update")
    )
    values["FOOTER_DESCRIPTION"] = escape(
        "A small desk lamp and coffee cup at %s. Gentle steam rises beside a stack of books." % phase
    )
    return phase, weather, values


def _celestial(phase, weather, palette):
    opacity = ".85" if weather == "clear" else ".28"
    if phase == "night":
        # A real crescent path avoids painting a flat circle over the sky gradient.
        return '<path d="M803 51a14 14 0 1 0 6 23 14 14 0 0 1-6-23Z" fill="%s" opacity="%s"/>' % (palette["CELESTIAL"], opacity)
    y = "65" if phase == "day" else "93"
    return '<g opacity="%s"><circle cx="796" cy="%s" r="23" fill="%s" opacity=".12"/><circle cx="796" cy="%s" r="13" fill="%s"/></g>' % (opacity, y, palette["CELESTIAL"], y, palette["CELESTIAL"])


def _weather(weather, palette):
    if weather == "clear":
        return ""
    cloud_opacity = ".46" if weather in {"rain", "storm"} else ".64"
    clouds = '<g class="clouds" fill="%s" opacity="%s"><path d="M609 80q-5-10 8-13 4-17 22-11 13-8 21 5 17-2 18 12 13 0 13 10h-82Z"/><path d="M750 95q-4-9 8-11 4-13 18-10 10-7 19 5 14-2 17 10 11 0 12 9h-74Z"/></g>' % (palette["CLOUD"], cloud_opacity)
    if weather == "cloud":
        return clouds
    if weather in {"rain", "storm"}:
        # Storm is a darker overcast scene with rain, never a flashing effect.
        shade = '<rect x="598" y="31" width="246" height="170" fill="#253444" opacity=".16"/>' if weather == "storm" else ""
        return shade + clouds + _RAIN
    if weather == "fog":
        return clouds + '<g class="mist" fill="none" stroke="%s" stroke-width="12" stroke-linecap="round"><path d="M590 126q64-12 127 0t139 0"/><path d="M576 151q72 12 145 0t141 0"/><path d="M590 182q61-10 124 0t141 0"/></g>' % palette["CLOUD"]
    positions = [(611, 12), (643, 55), (677, 4), (711, 84), (747, 30), (781, 66), (817, 9), (837, 111), (625, 136), (662, 182), (696, 125), (731, 199), (768, 143), (804, 184), (831, 222)]
    flakes = "".join('<circle cx="%s" cy="%s" r="%s"/>' % (x, y, "1.6" if i % 3 else "2.1") for i, (x, y) in enumerate(positions))
    return clouds + '<g class="snow" opacity=".8">' + flakes + '</g><g transform="translate(14 55)"><g class="snow snow-b">' + flakes + '</g></g>'


def render_header(scene: dict) -> str:
    """Return the 900 × 300 animated room for a normalized weather scene."""
    phase, weather, values = _context(scene)
    lamp_on = phase in {"night", "dusk"}
    values["DAY_CSS"] = "" if lamp_on else ".city-lights{animation:none!important;opacity:.55}.rain{stroke:#486D87!important;opacity:.35}.steam{stroke:#52677A}"
    values["EXTRA_CSS"] = _fill(_EXTRA_CSS, values)
    values["CAT"] = _fill(_CAT, values)
    values["CELESTIAL"] = _celestial(phase, weather, values)
    values["WEATHER"] = _weather(weather, values)
    values["ROOM_LIGHT"] = '<circle cx="650" cy="210" r="150" fill="url(#halo)" class="lamp-glow"/>' if lamp_on else (
        '<path d="M598 112l-135 137h160l221-137Z" fill="#FFE8B0" opacity=".07"/>' if weather == "clear" else ""
    )
    values["LAMP_LIGHT"] = '<path d="M608 176l-53 74h128l-43-74Z" fill="url(#light)" class="lamp-glow"/><g class="lamp-glow"><ellipse cx="620" cy="247" rx="55" ry="4" fill="#E9B76F" opacity=".07"/></g>' if lamp_on else ""
    return "\n".join(line.rstrip() for line in _fill(_HEADER, values).splitlines()) + "\n"


def render_footer(scene: dict) -> str:
    """Return the matching 900 × 95 footer, with the lamp off in daylight."""
    phase, _, values = _context(scene)
    values["FOOTER_LIGHT"] = '<path d="M722 32l-24 36h69l-28-36Z" fill="url(#light)" class="lamp-glow"/><g class="lamp-glow"><ellipse cx="735" cy="68" rx="29" ry="2" fill="#E9B76F" opacity=".07"/></g>' if phase in {"night", "dusk"} else ""
    return "\n".join(line.rstrip() for line in _fill(_FOOTER, values).splitlines()) + "\n"

_HEADER = r"""<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-labelledby="title desc">
  <title id="title">@TITLE@</title>
  <desc id="desc">@DESCRIPTION@</desc>
  <defs>
    <linearGradient id="room" x2="1" y2="1"><stop stop-color="@ROOM_START@"/><stop offset="1" stop-color="@ROOM_END@"/></linearGradient>
    <linearGradient id="glass" x2="0" y2="1"><stop stop-color="@SKY_START@"/><stop offset="1" stop-color="@SKY_END@"/></linearGradient>
    <linearGradient id="light" x1=".5" y1="0" x2=".5" y2="1"><stop stop-color="#E9B76F" stop-opacity=".22"/><stop offset="1" stop-color="#E9B76F" stop-opacity="0"/></linearGradient>
    <linearGradient id="wood" x2="0" y2="1"><stop stop-color="#576071"/><stop offset="1" stop-color="#3A485C"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#E9B76F" stop-opacity=".12"/><stop offset="1" stop-color="#E9B76F" stop-opacity="0"/></radialGradient>
    <clipPath id="window-clip"><rect x="598" y="31" width="246" height="170" rx="5"/></clipPath>
    <style>
      @EXTRA_CSS@
      .rain{animation:rain-fall 6.5s linear infinite;transform-box:view-box;stroke:#A9C4D8;stroke-width:1;stroke-linecap:round;opacity:.25}
      .rain-b{animation-duration:7.7s;animation-delay:-3.5s;opacity:.16}
      .rain-c{animation-duration:5.6s;animation-delay:-1.8s;opacity:.23}
      .steam{fill:none;stroke:@INK@;stroke-width:1.5;stroke-linecap:round;animation:steam-rise 6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
      .steam-b{animation-delay:-3s}
      .city-lights{animation:windows-breathe 9s ease-in-out infinite}
      .city-lights-b{animation-delay:-4.5s;animation-duration:12s}
      .lamp-glow{animation:lamp-breathe 8s ease-in-out infinite}
      @keyframes rain-fall{0%{transform:translateY(-58px)}100%{transform:translateY(72px)}}
      @keyframes steam-rise{0%,100%{transform:translate(0,2px) scaleX(.9);opacity:.13}50%{transform:translate(2px,-5px) scaleX(1.08);opacity:.45}}
      @keyframes windows-breathe{0%,100%{opacity:.43}50%{opacity:.85}}
      @keyframes lamp-breathe{0%,100%{opacity:.67}50%{opacity:.9}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}.steam{opacity:.35}}
    </style>
  </defs>
  <rect width="900" height="300" rx="16" fill="url(#room)"/>
  <path d="M0 269H900" stroke="@SMALL@" stroke-opacity=".07"/>
  @ROOM_LIGHT@

  <!-- A framed night view, with the movement contained inside the glass. -->
  <rect x="587" y="20" width="268" height="194" rx="10" fill="@FRAME@"/>
  <rect x="592" y="25" width="258" height="184" rx="7" fill="@TRIM@"/>
  <rect x="598" y="31" width="246" height="170" rx="5" fill="url(#glass)"/>
  <g clip-path="url(#window-clip)">
    @CELESTIAL@
    <path d="M590 155H611V125H635V144H650V109H676V130H695V151H711V118H733V137H749V103H768V129H787V146H807V119H826V140H856V207H590Z" fill="@CITY_FAR@"/>
    <path d="M590 172H624V151H648V166H663V142H689V169H711V155H740V178H755V149H781V170H799V157H826V174H856V207H590Z" fill="@CITY_NEAR@"/>
    <g fill="@CITY_LIGHT@" class="city-lights" opacity="@CITY_LIGHT_OPACITY@">
      <rect x="656" y="118" width="3" height="5" rx=".5"/><rect x="666" y="131" width="3" height="5" rx=".5"/><rect x="718" y="127" width="3" height="5" rx=".5"/><rect x="755" y="112" width="3" height="5" rx=".5"/><rect x="814" y="129" width="3" height="5" rx=".5"/><rect x="633" y="164" width="3" height="5" rx=".5"/><rect x="770" y="160" width="3" height="5" rx=".5"/>
    </g>
    <g fill="@CITY_LIGHT_SECONDARY@" class="city-lights city-lights-b" opacity="@CITY_LIGHT_OPACITY@">
      <rect x="617" y="135" width="3" height="4" rx=".5"/><rect x="728" y="144" width="3" height="4" rx=".5"/><rect x="762" y="124" width="3" height="4" rx=".5"/><rect x="674" y="154" width="3" height="4" rx=".5"/><rect x="719" y="165" width="3" height="4" rx=".5"/><rect x="807" y="170" width="3" height="4" rx=".5"/>
    </g>
    @WEATHER@
    <path d="M605 35H697L605 127Z" fill="#B0CDDF" opacity=".025"/>
  </g>
  <path d="M720 31V201" stroke="@TRIM@" stroke-width="5"/>
  <path d="M598 112H844" stroke="@TRIM@" stroke-width="4"/>
  <path d="M582 214H860" stroke="@SILL@" stroke-width="5" stroke-linecap="round"/>

  @CAT@

  <!-- The quiet space is deliberately reserved for the identity. -->
  <circle cx="55" cy="55" r="3" fill="#E9B76F"/>
  <text x="68" y="59" fill="@MUTED@" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10" letter-spacing="2.1">A LITTLE CORNER OF THE INTERNET</text>
  <text x="51" y="119" fill="@INK@" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-weight="650" font-size="48" letter-spacing="-1.8">TianLu-hub</text>
  <text x="54" y="151" fill="@SECONDARY@" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="16" letter-spacing="1">build · explore · repeat</text>
  <path d="M54 174H89" stroke="#E9B76F" stroke-width="2" stroke-linecap="round"/>
  <text x="54" y="199" fill="@SECONDARY@" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12.5" letter-spacing=".1">@WEATHER_LINE@</text>
  <text x="54" y="211" fill="@SMALL@" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="8.5" letter-spacing=".3">@UPDATED_LINE@</text>

  <!-- A single continuous desk joins the typography and the illustration. -->
  <rect x="45" y="251" width="810" height="8" rx="4" fill="url(#wood)"/>
  <path d="M56 253H844" stroke="#8C8D88" stroke-opacity=".18"/>
  <rect x="63" y="259" width="6" height="22" rx="2" fill="@DESK_LEGS@"/>
  <rect x="832" y="259" width="6" height="22" rx="2" fill="@DESK_LEGS@"/>

  <!-- Worn books, a bookmark, and a little brass paperweight. -->
  <rect x="71" y="240" width="122" height="10" rx="2" fill="#A3AEAF"/>
  <path d="M82 243H185m-103 3h103" stroke="@INK@" stroke-opacity=".35"/>
  <rect x="77" y="228" width="108" height="11" rx="2" fill="#AF8058"/>
  <path d="M87 232H178m-91 3h91" stroke="#E8CB9E" stroke-opacity=".5"/>
  <path d="M108 228v15l4-3 4 3v-15" fill="#E9B76F"/>
  <rect x="85" y="218" width="85" height="9" rx="2" fill="#566D7E"/>
  <path d="M96 222H164" stroke="#A6B3BD" stroke-opacity=".5"/>
  <circle cx="217" cy="244" r="6" fill="#C79B63"/>
  <circle cx="215" cy="242" r="2" fill="#F4D9A3" opacity=".5"/>

  <!-- Open pages: small, legible marks, with no invented measurements. -->
  <path d="M359 249l13-29q39-7 78 2 39-9 78-2l13 29q-45-7-91 1-47-8-91-1Z" fill="#A8A99F"/>
  <path d="M363 246l11-27q39-6 76 4v25q-44-8-87-2Z" fill="#EFE7D7"/>
  <path d="M450 223q37-10 76-4l11 27q-43-6-87 2Z" fill="#DDD5C4"/>
  <path d="M450 223v25" stroke="#A8A79C"/>
  <path d="M385 226l42 1m-45 5 45 1m-47 5 30 1m61-10 40-3m-40 10 44-3m-44 10 28-2" stroke="#7A8790" stroke-width="1" opacity=".5"/>
  <path d="M473 221l-7 30 4-2 3 3 5-32" fill="#B9815E"/>
  <path d="M324 248l25-27" stroke="#D4A46C" stroke-width="3" stroke-linecap="round"/>
  <path d="M322 250l2-6 3 3Z" fill="@INK@"/>

  <!-- A compact articulated lamp; its glow breathes very slowly. -->
  @LAMP_LIGHT@
  <path d="M585 244l-9-41 29-36" fill="none" stroke="#B29B7C" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M585 244l-9-41 29-36" fill="none" stroke="#D6BC94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="576" cy="203" r="5" fill="#7D807E"/>
  <circle cx="576" cy="203" r="2" fill="#D8BE95"/>
  <path d="M608 153q18-3 25 9l11 15h-45l3-17q1-5 6-7Z" fill="#D9A967"/>
  <path d="M600 177h44" stroke="@LAMP_EDGE@" stroke-width="3" stroke-linecap="round"/>
  <path d="M611 155q13-1 18 7" fill="none" stroke="#F6D9A5" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
  <path d="M568 248q0-7 18-7t18 7Z" fill="#AFA18D"/>

  <!-- Coffee and two independent curls of steam. -->
  <ellipse cx="706" cy="249" rx="26" ry="2.5" fill="@FRAME@" opacity=".4"/>
  <path d="M722 224h5q10 0 10 8t-14 8" fill="none" stroke="#D2C6AF" stroke-width="4"/>
  <path d="M685 221h39l-3 21q-1 6-16 6t-17-6Z" fill="#E5DBC7"/>
  <ellipse cx="704.5" cy="221" rx="19.5" ry="4.2" fill="#C6B89E"/>
  <ellipse cx="704.5" cy="221.5" rx="15.7" ry="2.7" fill="#534139"/>
  <path d="M692 229v10" stroke="@INK@" stroke-width="2" stroke-linecap="round" opacity=".65"/>
  <path d="M699 209c-8-7 6-10 0-18s-5-9-1-12" class="steam" opacity=".3"/>
  <path d="M710 210c7-6-6-10-1-16s5-8 2-12" class="steam steam-b" opacity=".25"/>

  <!-- The last object is a tiny plant reaching toward the window. -->
  <path d="M796 233v-27m0 15-9-10m9 3 10-12" fill="none" stroke="#748F89" stroke-width="2"/>
  <path d="M793 214q-13 1-13-11 12-1 13 11m5-6q-1-13 12-13 1 12-12 13m-2-1q-10-7-5-17 11 6 5 17" fill="#829A8C"/>
  <path d="M782 229h28l-4 19h-20Z" fill="#B38570"/>
  <path d="M782 229h28v4h-28Z" fill="#C7977E"/>
</svg>
"""

_FOOTER = r"""<svg xmlns="http://www.w3.org/2000/svg" width="900" height="95" viewBox="0 0 900 95" role="img" aria-labelledby="title desc">
  <title id="title">TianLu-hub — a little room for the next idea</title>
  <desc id="desc">@FOOTER_DESCRIPTION@</desc>
  <defs>
    <linearGradient id="room" x2="1" y2="1"><stop stop-color="@ROOM_START@"/><stop offset="1" stop-color="@ROOM_END@"/></linearGradient>
    <linearGradient id="light" x1=".5" y1="0" x2=".5" y2="1"><stop stop-color="#E9B76F" stop-opacity=".2"/><stop offset="1" stop-color="#E9B76F" stop-opacity="0"/></linearGradient>
    <style>
      .steam{fill:none;stroke:@INK@;stroke-width:1.1;stroke-linecap:round;animation:steam-rise 6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
      .steam-b{animation-delay:-3s}
      .lamp-glow{animation:lamp-breathe 8s ease-in-out infinite}
      @keyframes steam-rise{0%,100%{transform:translate(0,1px) scaleX(.9);opacity:.14}50%{transform:translate(1px,-3px) scaleX(1.08);opacity:.45}}
      @keyframes lamp-breathe{0%,100%{opacity:.65}50%{opacity:.9}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}.steam{opacity:.35}}
    </style>
  </defs>
  <rect width="900" height="95" rx="12" fill="url(#room)"/>
  <path d="M46 69H854" stroke="@SMALL@" stroke-opacity=".24"/>
  <circle cx="54" cy="45" r="2" fill="#E9B76F"/>
  <text x="66" y="49" fill="@SECONDARY@" font-family="Georgia,serif" font-style="italic" font-size="13">Leave a little room for the next idea.</text>
  @FOOTER_LIGHT@
  <path d="M703 64l-5-21 18-19" fill="none" stroke="#B29B7C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="698" cy="43" r="3" fill="#D6BC94"/>
  <path d="M719 18q11-2 15 5l7 10h-29l2-10q1-4 5-5Z" fill="#D9A967"/>
  <path d="M712 33h29" stroke="@LAMP_EDGE@" stroke-width="2" stroke-linecap="round"/>
  <path d="M693 68q0-4 10-4t10 4Z" fill="#AFA18D"/>
  <path d="M789 53h4q6 0 6 5t-9 5" fill="none" stroke="#D2C6AF" stroke-width="2.5"/>
  <path d="M767 51h24l-2 13q-1 4-10 4t-10-4Z" fill="#E5DBC7"/>
  <ellipse cx="779" cy="51" rx="12" ry="2.6" fill="#C6B89E"/>
  <ellipse cx="779" cy="51.5" rx="9.5" ry="1.6" fill="#534139"/>
  <path d="M775 44c-5-5 4-7 0-12s-3-6-1-8" class="steam" opacity=".3"/>
  <path d="M783 44c4-4-4-6-1-10s3-5 1-7" class="steam steam-b" opacity=".25"/>
  <path d="M819 65h24v3h-24Z" fill="#A3AEAF"/>
  <path d="M816 60h26v4h-26Z" fill="#AF8058"/>
  <path d="M821 57h22v3h-22Z" fill="#566D7E"/>
</svg>
"""
