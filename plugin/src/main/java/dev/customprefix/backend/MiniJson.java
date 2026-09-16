package dev.customprefix.backend;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A deliberately tiny, dependency-free JSON helper. This is NOT a general
 * purpose JSON library — it only needs to handle the flat, fixed-shape
 * objects the website's API returns (a handful of string/number/boolean
 * fields, no nesting, no arrays). Written this way specifically to avoid
 * an unverified assumption that Gson is present on Velocity's runtime
 * classpath for a payload this small.
 */
final class MiniJson {

  private MiniJson() {}

  static String escape(String s) {
    StringBuilder out = new StringBuilder(s.length() + 8);
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"': out.append("\\\""); break;
        case '\\': out.append("\\\\"); break;
        case '\n': out.append("\\n"); break;
        case '\r': out.append("\\r"); break;
        case '\t': out.append("\\t"); break;
        default:
          if (c < 0x20) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
      }
    }
    return out.toString();
  }

  /**
   * Parses a single flat JSON object into a map of raw tokens: string
   * values are unescaped and unquoted, numbers/booleans/null stay as their
   * literal text. Callers know their own schema and convert as needed.
   * Throws IllegalArgumentException on anything not matching that shape —
   * callers should treat a parse failure as "backend sent something
   * unexpected" rather than crash the proxy.
   */
  static Map<String, String> parseFlatObject(String json) {
    Map<String, String> result = new LinkedHashMap<>();
    String s = json.trim();
    if (!s.startsWith("{") || !s.endsWith("}")) {
      throw new IllegalArgumentException("not a JSON object: " + json);
    }
    s = s.substring(1, s.length() - 1).trim();
    int i = 0;
    int len = s.length();
    while (i < len) {
      while (i < len && Character.isWhitespace(s.charAt(i))) i++;
      if (i >= len) break;
      if (s.charAt(i) != '"') throw new IllegalArgumentException("expected key at " + i + " in " + json);
      int[] keyEnd = new int[1];
      String key = readString(s, i, keyEnd);
      i = keyEnd[0];
      while (i < len && Character.isWhitespace(s.charAt(i))) i++;
      if (i >= len || s.charAt(i) != ':') throw new IllegalArgumentException("expected ':' at " + i);
      i++;
      while (i < len && Character.isWhitespace(s.charAt(i))) i++;

      String value;
      if (i < len && s.charAt(i) == '"') {
        int[] valEnd = new int[1];
        value = readString(s, i, valEnd);
        i = valEnd[0];
      } else {
        int start = i;
        while (i < len && s.charAt(i) != ',' && s.charAt(i) != '}') i++;
        value = s.substring(start, i).trim();
      }
      result.put(key, value);

      while (i < len && Character.isWhitespace(s.charAt(i))) i++;
      if (i < len && s.charAt(i) == ',') i++;
    }
    return result;
  }

  private static String readString(String s, int start, int[] endOut) {
    // s.charAt(start) == '"'
    StringBuilder out = new StringBuilder();
    int i = start + 1;
    while (i < s.length() && s.charAt(i) != '"') {
      char c = s.charAt(i);
      if (c == '\\' && i + 1 < s.length()) {
        char next = s.charAt(i + 1);
        switch (next) {
          case '"': out.append('"'); i += 2; break;
          case '\\': out.append('\\'); i += 2; break;
          case '/': out.append('/'); i += 2; break;
          case 'n': out.append('\n'); i += 2; break;
          case 'r': out.append('\r'); i += 2; break;
          case 't': out.append('\t'); i += 2; break;
          case 'u':
            String hex = s.substring(i + 2, i + 6);
            out.append((char) Integer.parseInt(hex, 16));
            i += 6;
            break;
          default: out.append(next); i += 2;
        }
      } else {
        out.append(c);
        i += 1;
      }
    }
    endOut[0] = i + 1; // consume closing quote
    return out.toString();
  }
}
