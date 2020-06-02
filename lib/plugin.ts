import { Config, MSALBasic } from "./src/types";
import { MSAL } from "./src/main";
import { VueConstructor } from "vue";

export default class MSALPlugin {
  static install(Vue: VueConstructor, config: Config): void {
    Vue.prototype.$msal = new MSALPlugin(config);
  }

  constructor(config: Config) {
    const msal = new MSAL(config);

    const exposed: MSALBasic = {
      data: msal.data,
      login() {
        msal.login();
      },
      logout() {
        msal.logout();
      },
      isAuthenticated() {
        return msal.isAuthenticated();
      },
      async query(endpoint, options) {
        return await msal.query(endpoint, options);
      },
    };

    return exposed;
  }
}

export { Config };
