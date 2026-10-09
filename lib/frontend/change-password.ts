export const CHANGE_PASSWORD_PATH = "/api/account/password";
export const PASSWORD_CHANGED_LOGIN_PATH = "/login?passwordChanged=1";
export const PASSWORD_CHANGED_NOTICE = "Password changed successfully. Sign in again.";
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export type ChangePasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordValues, string>>;

type PasswordChangeErrorBody = {
  error?: {
    code?: string;
  };
};

export type PasswordChangeSuccess = {
  success: true;
  reauthenticationRequired: true;
};

export class PasswordChangeRequestError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string | null,
  ) {
    super("Password change failed.");
    this.name = "PasswordChangeRequestError";
  }
}

export function validateChangePassword(values: ChangePasswordValues): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};

  if (!values.currentPassword) {
    errors.currentPassword = "Current password is required.";
  } else if (values.currentPassword.length > MAX_PASSWORD_LENGTH) {
    errors.currentPassword = "Current password must be 256 characters or fewer.";
  }

  if (!values.newPassword) {
    errors.newPassword = "New password is required.";
  } else if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = "New password must be at least 12 characters.";
  } else if (values.newPassword.length > MAX_PASSWORD_LENGTH) {
    errors.newPassword = "New password must be 256 characters or fewer.";
  } else if (!/[A-Za-z]/.test(values.newPassword)) {
    errors.newPassword = "New password must contain at least one letter.";
  } else if (!/\d/.test(values.newPassword)) {
    errors.newPassword = "New password must contain at least one number.";
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm your new password.";
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function hasPasswordValidationErrors(errors: ChangePasswordErrors) {
  return Object.keys(errors).length > 0;
}

export function canSubmitPasswordChange(pending: boolean) {
  return !pending;
}

export async function submitPasswordChange(
  currentPassword: string,
  newPassword: string,
  fetcher: typeof fetch = fetch,
): Promise<PasswordChangeSuccess> {
  const response = await fetcher(CHANGE_PASSWORD_PATH, {
    method: "PATCH",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const errorBody = body as PasswordChangeErrorBody | null;
    throw new PasswordChangeRequestError(
      response.status,
      typeof errorBody?.error?.code === "string" ? errorBody.error.code : null,
    );
  }

  const result = body as Partial<PasswordChangeSuccess> | null;
  if (result?.success !== true || result.reauthenticationRequired !== true) {
    throw new PasswordChangeRequestError(null, null);
  }

  return { success: true, reauthenticationRequired: true };
}

export function passwordChangeFailure(error: unknown): {
  message: string | null;
  redirectTo: string | null;
} {
  if (!(error instanceof PasswordChangeRequestError)) {
    return {
      message: "The password could not be changed. Try again.",
      redirectTo: null,
    };
  }

  if (error.status === 401 && error.code === "INVALID_CREDENTIALS") {
    return { message: "Current password is incorrect.", redirectTo: null };
  }

  if (error.status === 401) {
    return { message: null, redirectTo: "/login" };
  }

  if (error.status === 400 && error.code === "INVALID_PASSWORD") {
    return {
      message: "New password does not meet the password requirements.",
      redirectTo: null,
    };
  }

  return {
    message: "The password could not be changed. Try again.",
    redirectTo: null,
  };
}

export function passwordChangedNoticeFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("passwordChanged") === "1" ? PASSWORD_CHANGED_NOTICE : null;
}
