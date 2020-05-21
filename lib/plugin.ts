import { Options, MSALBasic } from "./src/types";
import { MSAL } from "./src/main";
import { mixin } from "./mixin";
import { VueConstructor } from "vue";

export default class MSALPlugin {
  static install(Vue: VueConstructor, options: Options): void {
    Vue.prototype.$msal = new MSALPlugin(options);
    if (Vue && options.framework?.globalMixin) {
      Vue.mixin(mixin);
    }
  }

  constructor(options: Options) {
    const msal = new MSAL(options);

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
      async acquireToken(request) {
        return await msal.acquireToken(request);
      },
    };
    return exposed;
  }
}

export { Options };
