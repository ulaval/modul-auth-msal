# Exemples:

### Configuration du plugin:

```js
import msal, { Config } from "@ulaval/modul-auth-msal";

const msalConfig: Config = {
  auth: {
    clientId: "2sdfsdf1e79-a343-sdf9c-b444-41sdfs34sdf41era2f",
    redirectUri: "localhost:8080",
    requireAuthOnInitialize: true,
  },
  query: {
    parameters: {
      scopes: ["user.read"],
    },
    makeQueryOnInitialize: true, // Appel de la requête définie plus haut après l'initialisation du plugin
  },
};

Vue.use(msal, msalConfig);
```

### Component VueJS affichant le nom de l'utilisateur authentifié

```vue
<template>
  <div>
    <h1 class="m-u--h1">Bonjour {{ name }} !</h1>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";

@Component
export default class Home extends Vue {
  get name() {
    if (this.$msal.data.isAuthenticated) {
      return this.$msal.data.user.name;
    } else {
      return "";
    }
  }
}
</script>
```

### Récupération d'information depuis le CDS (Common Data Service)

```js
    // Définition de l'interface qui représente les items à récupérer
    interface Item {
        ["@odata.etag"]?: string;
        dti_itemid?: string;
        dti_nom?: string;
    }

    // Récupère des items contenus dans une entité (table) du CDS
    const response = (
      await this.$msal.query<{ value: Array<Item> }>(
        "https://ulavalexp.crm.dynamics.com/api/data/v9.1/items",
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
          data: {}, // Permet de conserver l'en-tête "Content-Type" (bug contenu dans la lib axios - https://github.com/axios/axios)
          method: "GET",
          responseType: "json",
        }, {
          // Query tentera de récupérer un token avec les accès requis pour envoyer des requêtes vers le CDS
          scopes: ["https://ulavalexp.crm.dynamics.com/user_impersonation"],
        }
      )
    )

    // Il est maintenant possible d'accéder aux items depuis response.value
    ...
```
