import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { USER_A, USER_B, resetTestDb, testContext } from "../../test/test-db.js";
import { createGym, deleteGym, listGyms, updateGym } from "../gyms.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("gym tools (#451)", () => {
  let admin: postgres.Sql;
  let context: UserContext;
  let otherContext: UserContext;

  beforeAll(async () => {
    admin = await resetTestDb();
    context = testContext(USER_A);
    otherContext = testContext(USER_B);
  });

  afterAll(async () => {
    await admin.end();
    await context.db.$client.end();
    await otherContext.db.$client.end();
  });

  it("makes the first gym home and lists home first", async () => {
    const preview = await createGym(context, { name: "Iron Temple", dryRun: true });
    expect(preview).toMatchObject({ dryRun: true });
    expect(await listGyms(context)).toEqual([]);

    const first = await createGym(context, { name: " Iron Temple ", address: "1 Main St" });
    expect(first).toMatchObject({ name: "Iron Temple", address: "1 Main St", isHome: true });
    const second = await createGym(context, { name: "Work Gym" });
    expect(second).toMatchObject({ isHome: false });

    const third = await createGym(context, { name: "Garage", makeHome: true });
    expect(third).toMatchObject({ isHome: true });
    const gyms = await listGyms(context);
    expect(gyms.map((g) => [g.name, g.isHome])).toEqual([
      ["Garage", true],
      ["Iron Temple", false],
      ["Work Gym", false],
    ]);
    expect(await listGyms(otherContext)).toEqual([]);
  });

  it("updates fields and moves home", async () => {
    const updated = await updateGym(context, {
      gym: "iron temple",
      name: "Iron Temple Downtown",
      address: "",
      makeHome: true,
    });
    expect(updated).toMatchObject({ name: "Iron Temple Downtown", address: null, isHome: true });
    const homes = (await listGyms(context)).filter((g) => g.isHome);
    expect(homes.map((g) => g.name)).toEqual(["Iron Temple Downtown"]);
    await expect(updateGym(context, { gym: "Nowhere", name: "x" })).rejects.toThrow(/list_gyms/);
    await expect(updateGym(context, { gym: "Garage", name: "  " })).rejects.toThrow(/name/);
  });

  it("previews deletes by default and hands home to the next gym", async () => {
    await deleteGym(context, { gym: "Iron Temple Downtown" });
    expect((await listGyms(context)).map((g) => g.name)).toContain("Iron Temple Downtown");

    const result = await deleteGym(context, { gym: "Iron Temple Downtown", dryRun: false });
    expect(result).toMatchObject({ deleted: true, newHome: "Work Gym" });
    const gyms = await listGyms(context);
    expect(gyms.map((g) => [g.name, g.isHome])).toEqual([
      ["Work Gym", true],
      ["Garage", false],
    ]);
  });

  it("registers the gym tools on the server", async () => {
    const server = createMcpServer(context);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_gyms", "create_gym", "update_gym", "delete_gym"]),
    );
    await client.close();
  });
});
