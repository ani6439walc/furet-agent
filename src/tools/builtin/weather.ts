import { logger } from "../../logger.js";

export const weatherDefinition = {
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "查詢指定城市的天氣。回傳目前溫度、體感溫度、天氣描述、降雨機率、未來三天預報。",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名稱，例如 Taipei、Tokyo、London" },
        lang: { type: "string", description: "語言代碼，預設 zh-tw" },
      },
      required: ["city"],
    },
  },
};

export async function executeWeather(args: { city: string; lang?: string }): Promise<string> {
  const city = encodeURIComponent(args.city);
  const lang = args.lang ?? "zh-tw";
  const langKey = `lang_${lang}`;

  logger.info({ city: args.city, lang }, "weather query");

  try {
    const response = await fetch(`https://wttr.in/${city}?format=j1&lang=${lang}`);

    if (!response.ok) {
      return `查詢失敗：HTTP ${response.status}`;
    }

    const data = await response.json() as Record<string, unknown>;
    const current = (data.current_condition as Record<string, unknown>[])?.[0];
    const forecasts = data.weather as Record<string, unknown>[];

    const getDesc = (obj: Record<string, unknown>) => {
      const langArr = obj[langKey] as { value: string }[] | undefined;
      if (langArr?.[0]?.value) return langArr[0].value;
      const descArr = obj.weatherDesc as { value: string }[] | undefined;
      return descArr?.[0]?.value ?? "N/A";
    };

    const result = {
      current: {
        temp_C: current?.temp_C,
        feels_like_C: current?.FeelsLikeC,
        description: current ? getDesc(current) : "N/A",
        humidity: current?.humidity,
        wind_kmph: current?.windspeedKmph,
      },
      forecast: forecasts?.slice(0, 3).map((day) => {
        const hourly = day.hourly as Record<string, unknown>[];
        const periods = [
          { name: "早上", data: hourly?.[2] },
          { name: "中午", data: hourly?.[4] },
          { name: "晚上", data: hourly?.[6] },
        ];
        return {
          date: day.date,
          max_C: day.maxtempC,
          min_C: day.mintempC,
          periods: periods.map((p) => ({
            name: p.name,
            temp_C: (p.data as Record<string, unknown>)?.tempC ?? "N/A",
            description: p.data ? getDesc(p.data as Record<string, unknown>) : "N/A",
            chance_of_rain: (p.data as Record<string, unknown>)?.chanceofrain ?? "N/A",
          })),
        };
      }),
    };

    return JSON.stringify(result, null, 2);
  } catch (err) {
    logger.error({ err, city: args.city }, "weather query failed");
    return `查詢失敗：${(err as Error).message}`;
  }
}
