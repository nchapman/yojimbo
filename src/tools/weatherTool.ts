import { Tool, DefaultToolInput, JSONSchema } from "./tool";

export class WeatherTool extends Tool<DefaultToolInput> {
  constructor() {
    super("Weather Tool", "Get weather information for a location", {
      properties: {
        input: {
          type: "string",
          description: "The location to get weather for",
        },
      },
      required: ["input"],
    });
  }

  async execute(args: DefaultToolInput): Promise<string> {
    const weatherData = {
      location: args.input,
      temperature: Math.floor(Math.random() * 30) + 10, // Random temp between 10-40°C
      condition: ["Sunny", "Partly Cloudy", "Cloudy", "Light Rain", "Thunder"][
        Math.floor(Math.random() * 5)
      ],
      humidity: Math.floor(Math.random() * 40) + 40, // Random humidity between 40-80%
      windSpeed: Math.floor(Math.random() * 20) + 5, // Random wind 5-25 km/h
    };

    return JSON.stringify(weatherData, null, 2);
  }
}
