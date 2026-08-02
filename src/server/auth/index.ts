import NextAuth from "next-auth";

import { authConfig } from "./config";

export { AuthError } from "next-auth";
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
