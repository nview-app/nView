const UNAUTHORIZED_IPC_RESPONSE = Object.freeze({ ok: false, error: "Unauthorized IPC caller" });

function createIpcSenderAuthorizer(options = {}) {
  const getRoleByWebContentsId =
    typeof options.getRoleByWebContentsId === "function"
      ? options.getRoleByWebContentsId
      : () => "unknown";

  function withAllowedRoles(channel, allowedRoles, handler) {
    const normalizedAllowedRoles = Array.from(new Set((allowedRoles || []).map((role) => String(role || "").trim()).filter(Boolean)));
    return async (event, ...args) => {
      const senderId = Number(event?.sender?.id);
      const senderRole = Number.isFinite(senderId) ? String(getRoleByWebContentsId(senderId) || "unknown") : "unknown";
      if (!normalizedAllowedRoles.includes(senderRole)) {
        console.warn(
          `[ipc-auth] Unauthorized IPC caller channel=${channel} senderId=${Number.isFinite(senderId) ? senderId : "unknown"} role=${senderRole}`,
        );
        return UNAUTHORIZED_IPC_RESPONSE;
      }
      return handler(event, ...args);
    };
  }

  return {
    withAllowedRoles,
  };
}

module.exports = {
  UNAUTHORIZED_IPC_RESPONSE,
  createIpcSenderAuthorizer,
};
