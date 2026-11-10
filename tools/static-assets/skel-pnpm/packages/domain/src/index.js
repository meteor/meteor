import Color from "color";

// This external dependency also exercises transitive resolution through the
// pnpm content-addressed store when the package is compiled for client and server.
export const accentColor = Color("rgb(64, 224, 208)").hex();

const createMessage = (target, value) => `domain:${target}:${value}`;

export const createClientMessage = (value) => createMessage("client", value);
export const createServerMessage = (value) => createMessage("server", value);
