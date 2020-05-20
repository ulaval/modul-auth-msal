import Vue from "vue";
import { MSALBasic, DataObject } from "./src/types";
import { CombinedVueInstance } from "vue/types/vue";

// Defines the module augmentation of the vue instance made with the plugin instantiation
type MSALPluginCombinedVueInstance = CombinedVueInstance<
  Vue,
  {
    $msal: MSALBasic;
  },
  unknown,
  unknown,
  unknown
>;

/**
 * Shotcut to access MSAL plugin data inside every Vue components that use this mixin
 */
export const mixin = Vue.extend({
  data(): { msal: DataObject } {
    return {
      msal: (this as MSALPluginCombinedVueInstance).$msal.data,
    };
  },
  created() {
    this.$watch(
      "$msal.data",
      (value: DataObject) => {
        this.msal = value;
      },
      { deep: true }
    );
  },
});
