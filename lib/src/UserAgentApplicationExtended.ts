import { Configuration, UserAgentApplication } from "msal";
import { AuthCache } from "msal/lib-commonjs/cache/AuthCache";

/**
 * Extension of the UserAgentApplication.
 * Exposes the private property UserAgentApplication.cacheStorage through the public property store.
 */
export class UserAgentApplicationExtended extends UserAgentApplication {
  public store: AuthCache;
  public configuration: Configuration;

  constructor(configuration: Configuration) {
    super(configuration);

    this.store = this.cacheStorage;
    this.configuration = configuration;
  }
}
