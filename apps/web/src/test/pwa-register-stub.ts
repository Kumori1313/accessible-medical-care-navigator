// Stand-in for the build-time `virtual:pwa-register` module so tests can import the app.
export function registerSW() {
  return async () => {};
}
