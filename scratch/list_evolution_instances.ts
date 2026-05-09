async function test() {
  try {
    const response = await fetch("https://exportelas-evolution.f0dgeg.easypanel.host/instance/fetchInstances", {
      headers: {
        "apikey": "D0AD7ED20164-454D-A1AF-D71226A35A60"
      }
    });
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
