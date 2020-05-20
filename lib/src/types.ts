import { Account, AuthError, AuthResponse } from "msal";
import conf from "msal/lib-commonjs/Configuration";
import { AxiosRequestConfig, AxiosResponse } from "axios";

export { AuthError, AuthResponse };

export type GraphRequest = AxiosRequestConfig & {
  url: string;
  id?: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GraphResponse<T = any> = AxiosResponse<T> & {};
export type GraphEndpoints =
  | string
  | GraphRequest
  | Array<string | GraphRequest>;
export type Endpoints = { [id: string]: string };

export type AuthOptions = {
  clientId: string;
  tenantId?: string;
  tenantName?: string;
  validateAuthority?: boolean;
  redirectUri?: string | (() => string);
  postLogoutRedirectUri?: string | (() => string);
  navigateToLoginRequestUrl?: boolean;
  requireAuthOnInitialize?: boolean;
  autoRefreshToken?: boolean;
};
export type CacheOptions = conf.CacheOptions;
export type SystemOptions = conf.SystemOptions;
export type GraphOptions = {
  callAfterInit?: boolean;
  baseUrl?: string;
  endpoints?: Endpoints;
};
export type RequestOptions = {
  scopes?: string[];
};
export type FrameworkOptions = {
  globalMixin?: boolean;
};
export type Options = {
  auth: AuthOptions;
  request?: RequestOptions;
  graph?: GraphOptions;
  cache?: CacheOptions;
  system?: SystemOptions;
  framework?: FrameworkOptions;
};

export type UserData = Account;
export type GraphData = { [id: string]: unknown };
export type DataObject = {
  isAuthenticated: boolean;
  accessToken: string;
  user?: UserData;
  graph?: GraphData;
};

export interface MSALBasic {
  data: DataObject;
  login: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: <T = any>(
    endpoints: GraphEndpoints,
    batchUrl?: string
  ) => Promise<GraphResponse<T>>;
}

export enum ErrorCode {
  "ConsentRequired" = "consent_required",
  "LoginRequired" = "login_required",
  "InteractionRequired" = "interaction_required",
}
