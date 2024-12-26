import { OpenAI } from 'openai';
import { Agent } from '../src/agents/agent';
import { LLMCompletion } from '../src/types/openai';
import { Team } from '../src/teams/team';
import { WeatherTool } from '../src/tools/weatherTool';

// At the top of the file, after imports
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create the LLM completion function
const llm: LLMCompletion = async (args) => {
  return openai.chat.completions.create({
    model: 'gpt-4o-mini',
    ...args,
  });
};

const weatherAgent = new Agent({
  role: 'Weather Reporter',
  goal: 'Report the weather for a given location.',
  tools: [new WeatherTool()],
});

const sillyWriterAgent = new Agent({
  role: 'Silly Writer',
  goal: 'Write a short silly story.',
});

const team = new Team({
  agents: [weatherAgent, sillyWriterAgent],
  llm,
});

team.emitter.on('*', (event, data) => {
  const { tool, ...restData } = data;

  if (event === 'delta' && 'content' in data) {
    process.stdout.write(data.content);
  } else {
    process.stdout.write('\n');
    console.log(`${event}:`, restData);
  }
});

const response = await team.execute({
  input: 'Write me a funny story about the current weather in Tokyo.',
});

console.log(response);
