module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  rootDir: ".",
  testRegex: ".spec.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  clearMocks: true,
};
