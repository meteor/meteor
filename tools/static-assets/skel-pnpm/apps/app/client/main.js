import { Meteor } from "meteor/meteor";
import { createClientMessage } from "@example/shared";
import { renderWorkspaceStatus } from "@example/ui/client";
import "./main.css";

console.log(createClientMessage("pnpm workspace package loaded on the client"));

Meteor.startup(() => {
  const container = document.getElementById("app-target");
  container.innerHTML = renderWorkspaceStatus();
});
