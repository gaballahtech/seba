declare module "@gaballahtech/seba";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "seba-login": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { "client-id"?: string }, HTMLElement>;
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "seba-login": any;
    }
  }
}
export {};
