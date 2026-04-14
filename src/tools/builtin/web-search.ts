import { logger } from "../../logger.js";
import { loadConfig } from "../../config.js";

export const webSearchDefinition = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "Search the web. Returns search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
};

export async function executeWebSearch(args: { query: string }): Promise<string> {
  const config = loadConfig();
  const provider = config.web_search.provider;
  logger.info({ query: args.query, provider }, "web_search");

  switch (provider) {
    case "google": return searchGoogle(args.query, config.web_search.google_api_key);
    case "duckduckgo": return searchDuckDuckGo(args.query);
    case "searxng": return searchSearXNG(args.query, config.web_search.searxng_url);
    default: return `Unknown search provider: ${provider}`;
  }
}

// --- Google (Gemini grounding) ---

interface GeminiCandidate {
  content: { parts: Array<{ text?: string }> };
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri: string; title: string } }>;
  };
}

async function searchGoogle(query: string, apiKey: string): Promise<string> {
  if (!apiKey) return "Error: google_api_key not set in config.yaml";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      logger.error({ status: response.status, err }, "google search failed");
      return `Search failed: HTTP ${response.status}`;
    }

    const data = await response.json() as { candidates: GeminiCandidate[] };
    const candidate = data.candidates?.[0];
    if (!candidate) return "No results found.";

    const text = candidate.content.parts.map(p => p.text).filter(Boolean).join("\n");
    const sources = candidate.groundingMetadata?.groundingChunks
      ?.map(c => c.web ? `- [${c.web.title}](${c.web.uri})` : null)
      .filter(Boolean)
      .join("\n");

    return [text, sources ? `\nSources:\n${sources}` : ""].join("\n");
  } catch (err) {
    logger.error({ err }, "google search error");
    return `Search error: ${(err as Error).message}`;
  }
}

// --- DuckDuckGo (html lite) ---

async function searchDuckDuckGo(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Furet/1.0)" },
    });

    if (!response.ok) return `Search failed: HTTP ${response.status}`;

    const html = await response.text();

    // 從 DDG HTML lite 提取結果
    const results: string[] = [];
    const regex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.+?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.+?)<\/a>/g;
    let match;
    let count = 0;
    while ((match = regex.exec(html)) !== null && count < 8) {
      const rawHref = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();

      // DDG href 是重定向連結，提取真正的 URL
      let href = rawHref;
      const uddgMatch = rawHref.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        href = decodeURIComponent(uddgMatch[1]);
      }

      results.push(`[${title}](${href})\n${snippet}`);
      count++;
    }

    if (results.length === 0) return "No results found.";

    return "Search results:\n\n" + results.join("\n\n");
  } catch (err) {
    logger.error({ err }, "duckduckgo search error");
    return `Search error: ${(err as Error).message}`;
  }
}

// --- SearXNG ---

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
}

async function searchSearXNG(query: string, baseUrl: string): Promise<string> {
  if (!baseUrl) return "Error: searxng_url not set in config.yaml";

  try {
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url);

    if (!response.ok) return `Search failed: HTTP ${response.status}`;

    const data = await response.json() as { results: SearXNGResult[] };
    const results = data.results?.slice(0, 8).map(r =>
      `- [${r.title}](${r.url})\n  ${r.content}`
    );

    return results?.length > 0 ? results.join("\n\n") : "No results found.";
  } catch (err) {
    logger.error({ err }, "searxng search error");
    return `Search error: ${(err as Error).message}`;
  }
}
