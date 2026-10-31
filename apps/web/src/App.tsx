import { Button, SkipLink } from "@amcn/ui";

export function App() {
  return (
    <>
      <SkipLink />
      <header>
        <h1>Accessible Medical Care Navigator</h1>
      </header>
      <main id="main" tabIndex={-1}>
        <p>Photograph a medical form and get a plain-language explanation.</p>
        <Button>Add a document</Button>
      </main>
    </>
  );
}
