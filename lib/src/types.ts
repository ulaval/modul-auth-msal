import { AxiosRequestConfig, AxiosResponse, Method, ResponseType } from "axios";
import {
  Account,
  AuthenticationParameters,
  AuthError,
  AuthResponse,
} from "msal";
import conf from "msal/lib-commonjs/Configuration";
import { ILogger } from "./interfaces";

export { AuthError, AuthResponse };

export type LogLevel = "info" | "debug" | "warn";

export type Query = AxiosRequestConfig & {
  url: string;
  id?: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryResponse<T = any> = AxiosResponse<T>;
export type QueryEndpoint = string | Query;
export type QueryParameters = AuthenticationParameters;
export type QueryOptions = {
  method?: Method;
  headers?: { [id: string]: string };
  params?: { [id: string]: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  responseType?: ResponseType;
};
export type Endpoints = { [id: string]: string };

export type AuthConfig = {
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
export type CacheConfig = conf.CacheOptions;
export type SystemConfig = conf.SystemOptions;
export type QueryConfig = {
  parameters: QueryParameters;
  baseUrl?: string;
};
export type Config = {
  auth: AuthConfig;
  query?: QueryConfig;
  cache?: CacheConfig;
  system?: SystemConfig;
  logger?: ILogger;
};

export type UserData = Account;
export type QueryData = { [id: string]: unknown };
export type DataObject = {
  isAuthenticated: boolean;
  user?: UserData;
  query: QueryData;
};

export interface MSALBasic {
  data: DataObject;
  login: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: <Response = any>(
    endpoint: QueryEndpoint,
    options: QueryOptions,
    parameters?: QueryParameters
  ) => Promise<QueryResponse<Response>>;
}

export enum ErrorCode {
  "ConsentRequired" = "consent_required",
  "LoginRequired" = "login_required",
  "InteractionRequired" = "interaction_required",
}
