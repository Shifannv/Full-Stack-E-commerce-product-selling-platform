export const authOptions = {
  user: {
    modelName: "users",
    additionalFields: {
      status: {
        type: "string",
        required: true,
        defaultValue: "ACTIVE",
        input: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: { modelName: "sessions" },
  account: {
    modelName: "accounts",
    accountLinking: { enabled: false, disableImplicitLinking: true },
  },
  verification: { modelName: "verifications" },
  emailAndPassword: { enabled: true, disableSignUp: true },
} as const;
