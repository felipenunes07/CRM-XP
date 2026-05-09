import { Dropbox } from "dropbox";
import fetch from "isomorphic-fetch";

const dbx = new Dropbox({
  refreshToken: "lYPb2Dqjc4QAAAAAAAAAAfSSQ2MbwyeUp-PxdJ7Nv1rG2eHl_9vd-dBJH-IBturV",
  clientId: "gklahw2oshniq07",
  clientSecret: "10hxkb0crvv1mr3",
  fetch,
});

async function test() {
  try {
    const response = await dbx.filesListFolder({ path: "" });
    console.log("Success! Files in root:", response.result.entries.length);
  } catch (error) {
    console.error("Failed to list files:", error);
  }
}

test();
