console.log("Testing model switch...");
console.log("OPENAI_MODEL before:", process.env.OPENAI_MODEL);
console.log("OPENAI_BASE_URL before:", process.env.OPENAI_BASE_URL);

// Simulate model switching (testing environment variables)
process.env.OPENAI_MODEL = "claude-sonnet-4-20250514";
delete process.env.OPENAI_BASE_URL;

console.log("OPENAI_MODEL after:", process.env.OPENAI_MODEL);
console.log("OPENAI_BASE_URL after:", process.env.OPENAI_BASE_URL);
