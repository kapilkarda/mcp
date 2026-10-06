/**
 * Workspace selection for the connector sign-in. A QCall login token is scoped to
 * the user's oldest owned workspace; users who belong to several (owned or
 * invited) pick one, and we exchange the login token for that workspace's token
 * exactly like app.qcall.ai's "Select workspace" screen does.
 */

import axios from "axios";

export interface WorkspaceChoice {
  /** workspace_id */
  id: string;
  /** workspace owner's user id (the `id` ws-token expects) */
  owner: string;
  /** the signed-in member's invitee id */
  invitee: string;
  name: string;
  role?: string;
}

export class QcallWorkspaceApi {
  constructor(private readonly apiBaseUrl: string) {}

  private request(method: "get" | "post", path: string, jwt: string, body?: unknown) {
    return axios.request({
      method,
      url: `${this.apiBaseUrl}${path}`,
      data: body,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${jwt}` },
      timeout: 15_000,
      maxRedirects: 0,
      validateStatus: () => true
    });
  }

  /** Accepted workspaces of the signed-in user; [] when the list can't be loaded. */
  async listWorkspaces(jwt: string): Promise<WorkspaceChoice[]> {
    try {
      const res = await this.request("get", "/workspace/my-workspaces", jwt);
      if (res.status !== 200 || res.data?.success === false || !Array.isArray(res.data?.data)) return [];
      return (res.data.data as Array<Record<string, unknown>>)
        .filter((w) => typeof w.workspace_id === "string" && typeof w.user_id === "string" && typeof w.invitee_id === "string")
        .map((w) => ({
          id: w.workspace_id as string,
          owner: w.user_id as string,
          invitee: w.invitee_id as string,
          name: String(w.workspace_name || "Workspace").slice(0, 80),
          role: typeof (w.org_role ?? w.role) === "string" ? String(w.org_role ?? w.role) : undefined
        }));
    } catch (error) {
      console.error("[oauth] could not list workspaces:", (error as Error).message);
      return [];
    }
  }

  /** Token scoped to the chosen workspace (backend checks accepted membership). */
  async workspaceToken(jwt: string, workspace: WorkspaceChoice): Promise<string | undefined> {
    try {
      const res = await this.request("post", "/workspace/ws-token", jwt, {
        invitee_id: workspace.invitee,
        workspace_id: workspace.id,
        id: workspace.owner
      });
      const token = res.data?.token;
      return res.status === 200 && res.data?.success !== false && typeof token === "string" ? token : undefined;
    } catch (error) {
      console.error("[oauth] could not switch workspace:", (error as Error).message);
      return undefined;
    }
  }
}
