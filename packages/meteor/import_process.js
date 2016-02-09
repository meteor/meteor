if (Package["meteor-env-dev"]) {
  process = Package["meteor-env-dev"].process;
} else if (Package["meteor-env-prod"]) {
  process = Package["meteor-env-prod"].process;
}
