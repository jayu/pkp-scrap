module.exports = {
  log: (...args) => {
    console.log(`[${new Date().toISOString()}]`, ...args);
  },
  error: (...args) => {
    console.error(`[${new Date().toISOString()}]`, ...args);
  }
}