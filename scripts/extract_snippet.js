const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:/Users/badrg/.gemini/antigravity/brain/b627526e-5fa1-42cc-9054-d89d942718d0/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":445')) {
      const data = JSON.parse(line);
      fs.writeFileSync('user_code_snippet.txt', data.content, 'utf8');
      console.log('Saved snippet, bytes:', data.content.length);
      return;
    }
  }
}

extract().catch(console.error);

