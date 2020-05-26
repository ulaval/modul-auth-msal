import { cloneDeep, includes } from "lodash";
import axios from "axios";
import { UserAgentApplicationExtended } from "./UserAgentApplicationExtended";
import {
  AuthOptions,
  RequestOptions,
  GraphOptions,
  CacheOptions,
  Options,
  DataObject,
  MSALBasic,
  GraphEndpoint,
  GraphRequest,
  GraphResponse,
  ErrorCode,
  AuthError,
  GraphData,
  GraphRequestConfig,
} from "./types";

/**
 * Manage authentication and querying of Microsoft's onlice services
 */
export class MSAL implements MSALBasic {
  private lib: UserAgentApplicationExtended;
  private tokenExpirationTimer?: number;
  private readonly auth: AuthOptions = {
    clientId: "",
    tenantId: "common",
    tenantName: "login.microsoftonline.com",
    validateAuthority: true,
    redirectUri: window.location.href,
    postLogoutRedirectUri: window.location.href,
    navigateToLoginRequestUrl: true,
    requireAuthOnInitialize: false,
    autoRefreshToken: true,
  };
  private readonly cache: CacheOptions = {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
  };
  private readonly request: RequestOptions = {
    scopes: ["user.read"],
  };
  private readonly graph: GraphOptions = {
    callAfterInit: false,
    endpoints: { profile: "/me" },
    baseUrl: "https://graph.microsoft.com/v1.0",
  };

  public data: DataObject = {
    isAuthenticated: false,
    accessToken: "",
  };

  constructor(private readonly options: Options) {
    if (!options.auth.clientId) {
      throw new Error("auth.clientId option is required");
    }

    this.auth = Object.assign(this.auth, options.auth);
    this.cache = Object.assign(this.cache, options.cache);
    this.request = Object.assign(this.request, options.request);
    this.graph = Object.assign(this.graph, options.graph);

    this.lib = new UserAgentApplicationExtended({
      auth: {
        clientId: this.auth.clientId,
        authority: `https://${this.auth.tenantName}/${this.auth.tenantId}`,
        validateAuthority: this.auth.validateAuthority,
        redirectUri: this.auth.redirectUri,
        postLogoutRedirectUri: this.auth.postLogoutRedirectUri,
        navigateToLoginRequestUrl: this.auth.navigateToLoginRequestUrl,
      },
      cache: this.cache,
      system: cloneDeep(options.system),
    });

    if (this.auth.requireAuthOnInitialize) {
      this.login();
    }

    this.data.isAuthenticated = this.isAuthenticated();
    if (this.data.isAuthenticated) {
      // Get basic user information
      this.data.user = this.lib.getAccount();

      this.acquireToken().then(() => {
        if (this.graph.callAfterInit) {
          this.initialMSGraphCall();
        }
      });
    }
  }

  /**
   * Use when initiating the login process by redirecting the user's browser to the authorization endpoint.
   */
  public login(): void {
    if (!this.isAuthenticated()) {
      this.lib.loginRedirect(this.request);
    }
  }

  /**
   * Use to log out the current user, and redirect the user to the postLogoutRedirectUri.
   * Default behaviour is to redirect the user to `window.location.href`.
   */
  public logout(): void {
    if (this.isAuthenticated()) {
      this.lib.logout();
    }
  }

  /**
   * Check if the user is authenticated
   */
  public isAuthenticated(): boolean {
    return (
      !this.lib.isCallback(window.location.hash) && !!this.lib.getAccount()
    );
  }

  /**
   * Allows to query MSGraph API
   * @param endpoint The API endpoint to query
   * @param options The request options (method, headers, params, data, responseType)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query<Response = any>(
    endpoint: GraphEndpoint,
    options: GraphRequestConfig = {
      method: "GET",
      responseType: "json",
    }
  ): Promise<GraphResponse<Response>> {
    return await this.executeRequest<Response>(endpoint, options);
  }

  /**
   * Allow to fetch the cached token or acquire a new one.
   * Note: returns false in case of error.
   * @param request The authentication parameters used to fetch the token
   */
  public async acquireToken(request = this.request): Promise<string | boolean> {
    try {
      // Use acquireTokenSilent to obtain the signed in user's token from cache.
      const response = await this.lib.acquireTokenSilent(request);

      // Check that its not the same token as the one currently set (or the cached one).
      if (this.data.accessToken !== response.accessToken) {
        this.setAccessToken(
          response.accessToken,
          response.expiresOn,
          response.scopes
        );
      }

      return response.accessToken;
    } catch (error) {
      // Upon acquireTokenSilent failure (due to consent, interaction or login required ONLY)
      // Call acquireTokenRedirect
      if (this.requiresInteraction((error as AuthError).errorCode)) {
        this.lib.acquireTokenRedirect(request);
      }

      return false;
    }
  }

  /**
   * Initial MS Graph request on instantiation
   */
  private async initialMSGraphCall(): Promise<void> {
    const endpoints = this.graph.endpoints;

    if (endpoints !== undefined) {
      const results: GraphData = {};
      const requests: GraphRequest[] = [];

      // Fetch cached results
      let storedIds: string[] = [];
      const storedStringData = this.lib.store.getItem(
        `msal.msgraph-${this.data.accessToken}`
      );
      if (storedStringData) {
        const storedData: GraphData = JSON.parse(storedStringData);
        storedIds = Object.keys(storedData);

        Object.assign(results, storedData);
      }

      // Only keep requests that have not already been made and cached
      for (const id in endpoints) {
        if (!includes(storedIds, id)) {
          requests.push({
            id: id,
            url: endpoints[id],
          });
        }
      }

      const promises = requests.map(async (endpoint) => {
        return {
          id: endpoint.id as string,
          value: await this.query(endpoint),
        };
      });

      await Promise.all(promises).then((responses) => {
        const formattedResponses: GraphData = {};

        for (const resp of responses) {
          formattedResponses[resp.id] = resp.value.data;
        }

        Object.assign(results, formattedResponses);
      });

      // Append new results to the cached ones and save them into the store.
      this.data.graph = cloneDeep(results);
      this.lib.store.setItem(
        `msal.msgraph-${this.data.accessToken}`,
        JSON.stringify({ ...results })
      );
    }
  }

  /**
   * Check if a user interation is required based on an error code
   * @param errorCode The error code returned by the Microsoft API
   */
  private requiresInteraction(errorCode: string): boolean {
    if (!errorCode) {
      return false;
    }

    return (
      errorCode === ErrorCode.ConsentRequired ||
      errorCode === ErrorCode.InteractionRequired ||
      errorCode === ErrorCode.LoginRequired
    );
  }

  /**
   * Set the current access token and handle token expiration
   * @param accessToken The access token used to query Microsoft related services
   * @param expiresOn The moment when the token will expire
   * @param scopes The permissions that the client request access to
   */
  private setAccessToken(
    accessToken: string,
    expiresOn: Date,
    scopes: string[]
  ): void {
    this.data.accessToken = accessToken;

    // Sets the window of offset needed to renew the token before expiry
    const tokenRenewalOffset = this.lib.configuration.system
      ?.tokenRenewalOffsetSeconds;
    const expirationOffset = tokenRenewalOffset || 0;

    const expiration =
      expiresOn.getTime() - new Date().getTime() - expirationOffset;

    // Clear the timer is set before setting a new one
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }

    // Set a timer for when the token will expire
    this.tokenExpirationTimer = window.setTimeout(() => {
      // Refresh the token once it expires if auto refresh is on.
      if (this.auth.autoRefreshToken) {
        this.acquireToken({ scopes });
      } else {
        this.data.accessToken = "";
      }
    }, expiration);
  }

  /**
   * Execute a request and return its response
   * @param endpoint The API endpoint to query
   * @param options The request options (method, headers, params, data, responseType)
   */
  private async executeRequest<Response>(
    endpoint: GraphEndpoint,
    options: GraphRequestConfig
  ): Promise<GraphResponse<Response>> {
    const request = this.createRequest(endpoint, options);

    // If the request URL is only a path (e.g. /api/blabla), append the graph base URL to it.
    if (request.url.search("http") !== 0 && this.graph.baseUrl !== undefined) {
      request.url = `${this.graph.baseUrl}${request.url}`;
    }
    request.headers = {
      ...request.headers,
      Authorization: `Bearer ${this.data.accessToken}`,
    };

    return await axios.request<Response>(request);
  }

  /**
   * Create a graph request object
   * @param endpoint The API endpoint to query
   * @param options The request options (method, headers, params, data, responseType)
   * @param index The request index (in case of batch request)
   */
  private createRequest(
    endpoint: string | GraphRequest,
    options: GraphRequestConfig,
    index = 0
  ): GraphRequest {
    if (typeof endpoint === "string") {
      endpoint = { url: endpoint };
    }
    if (typeof endpoint === "object" && endpoint.url === "") {
      throw new Error("Empty endpoint url");
    }

    const request: GraphRequest = {
      ...options,
      url: endpoint.url,
      id: endpoint.id || `defaultID-${index}`,
    };

    return request;
  }
}
