const { execSync } = require("child_process");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function askAI(prompt) {
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: prompt
      })
    });

    const data = await res.json();

    const text =
      data?.output?.[0]?.content?.[0]?.text ||
      data?.output_text ||
      null;

    if (!text) {
      console.log("❌ API RAW:", JSON.stringify(data, null, 2));
      return "echo NO_COMMAND";
    }

    return text.trim();

  } catch (e) {
    console.log("❌ FETCH ERROR:", e.message);
    return "echo FETCH_ERROR";
  }
}

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8" });
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

async function main() {
  const goal = process.argv.slice(2).join(" ");

  if (!goal) {
    console.log("❌ Give goal");
    return;
  }

  let context = `GOAL: ${goal}\n`;

  for (let i = 0; i < 5; i++) {
    console.log(`\n🔁 STEP ${i+1}`);

    const command = await askAI(context + `
Return ONLY a bash command.
`);

    console.log("🤖", command);

    if (!command) break;

    const output = runCommand(command);

    console.log("📤", output);

    context += `
CMD: ${command}
OUT:
${output}
`;
  }
}

main();
