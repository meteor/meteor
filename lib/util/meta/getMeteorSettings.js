export default function getMeteorSettings (settings) {
  return Object.assign(
    {
      collections: []
    },
    settings.meteor
  )
}
