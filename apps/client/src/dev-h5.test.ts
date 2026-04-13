import assert from "node:assert/strict";
import test from "node:test";

test("H5 server exposes create and review entry pages", async () => {
  const { buildH5Server } = await import("./h5-app.js");
  const app = buildH5Server();

  try {
    const createPage = await app.inject({
      method: "GET",
      url: "/create",
    });
    assert.equal(createPage.statusCode, 200);
    assert.match(createPage.headers["content-type"] ?? "", /text\/html/);
    assert.match(createPage.body, /创建对象/);
    assert.match(createPage.body, /提交发布审核/);

    const reviewPage = await app.inject({
      method: "GET",
      url: "/review",
    });
    assert.equal(reviewPage.statusCode, 200);
    assert.match(reviewPage.headers["content-type"] ?? "", /text\/html/);
    assert.match(reviewPage.body, /审核台/);
    assert.match(reviewPage.body, /发布审核/);
  } finally {
    await app.close();
  }
});
