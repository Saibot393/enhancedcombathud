import {ArgonComponent} from "./components/component.js";
import { DrawerButton } from "./components/drawer/drawerButton.js";
import { DrawerPanel } from "./components/drawer/drawerPanel.js";
import { AccordionPanel } from "./components/main/buttonPanel/accordionPanel.js";
import { AccordionPanelCategory } from "./components/main/buttonPanel/accordionPanelCategory.js";
import { ButtonPanel } from "./components/main/buttonPanel/buttonPanel.js";
import { ActionButton } from "./components/main/buttons/actionButton.js";
import { ButtonPanelButton } from "./components/main/buttons/buttonPanelButton.js";
import { ItemButton } from "./components/main/buttons/itemButton.js";
import {SplitButton} from "./components/main/buttons/splitButton.js";
import {ActionPanel} from "./components/main/actionPanel.js";
import {PortraitPanel} from "./components/portrait/portraitPanel.js";
import {WeaponSets} from "./components/main/weaponSets.js";
import { MovementHud } from "./components/main/movementHud.js";
import {ArgonTooltip} from "./tooltip.js";

import { PassTurnPanel } from "./prefab/passTurnPanel.js";

export const MODULE_ID = "enhancedcombathud";
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/`;
export const PARTIALS_PATH = `modules/${MODULE_ID}/templates/partials/`;

export function localize(string){
  return game.i18n.localize(string);
}

const mainSystemComponents = {
  PORTRAIT: null,
  DRAWER: null,
  MAIN: [],
  WEAPONSETS: WeaponSets,
  MOVEMENT: MovementHud,
}


export class CoreHUD extends Application{
  constructor () {
    super();
    this.performModuleCheck();
    this._itemButtons = [];
    Hooks.callAll(`argonInit`, CoreHUD);
    Hooks.on("argon-onSetChangeComplete", this._updateActionContainers.bind(this));
    Hooks.on("updateItem", this._onUpdateItem.bind(this));
    Hooks.on("combatStart", this._onCombatStart.bind(this));
    Hooks.on("updateCombat", this._onUpdateCombat.bind(this));
    Hooks.on("deleteCombat", this._onDeleteCombat.bind(this));
    Hooks.on("updateActor", this._onUpdateActor.bind(this));
    Hooks.on("updateToken", this._onUpdateToken.bind(this));
    Hooks.on("controlToken", this._onControlToken.bind(this));
    CoreHUD.setColorSettings();
  }

  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      id: "enhancedcombathud",
      template: "modules/enhancedcombathud/templates/coreHUD.hbs",
      popOut: false,
      dragDrop: [{dragSelector: null, dropSelector: null}],
    }
  }

  _canDragDrop(selector) {
    return true;
  }

  get buttonPanelContainer(){
    return this._buttonPanelContainer;
  }

  get actionBarWidth() {
    let totalActionBarWidth = 0;
    this.element[0].querySelectorAll(".actions-container").forEach(element => {
      totalActionBarWidth += element.offsetWidth;
    });
    return totalActionBarWidth;
  }

  get itemButtons() {
    return this._itemButtons;
  }

  async _updateActionContainers() {
    this.components.main.forEach(component => component.updateVisibility());
  }

  _onCombatStart(combat) {
    this.components.movement?._onNewRound(combat);
    const openCombatStart = game.settings.get("enhancedcombathud", "openCombatStart");
    if (openCombatStart) this.bind(canvas.tokens.controlled[0] ?? _token);
  }

  _onUpdateCombat(combat, updates) {
    this.components.combat.forEach(component => component.updateVisibility());
    if("round" in updates) this.components.movement?._onNewRound(combat);
  }

  _onDeleteCombat(combat) {
    this.components.movement?._onCombatEnd(combat);
  }

  _onUpdateItem(item) {
    if (item.parent !== this._actor) return;
    for (const itemButton of this.itemButtons) {
      if (itemButton.item === item) itemButton.render();
    }
  }

  updateItemButtons(items) {
    if(!Array.isArray(items)) items = [items];
    for (const itemButton of this.itemButtons) {
      if (items.includes(itemButton.item)) itemButton.render();
    }
  }

  _onUpdateActor(actor) {
    if (actor !== this._actor) return;
    this.components.portrait.render();
  }

  _onUpdateToken(tokenDocument, updates) {
    if (tokenDocument !== this._token.document) return;
    this.components.movement?.onTokenUpdate(updates);
  }

  _onControlToken(token, controlled) {
    if (!controlled) return;
    const alwaysOn = game.settings.get("enhancedcombathud", "alwaysOn");
    if(alwaysOn) this.bind(token);
  }

  async _renderInner(data) {
    const element = await super._renderInner(data);
    const html = element[0];
    this.components = {
      weaponSets: new mainSystemComponents.WEAPONSETS(),
      movement: this._token ? new mainSystemComponents.MOVEMENT() : null,
      portrait: new mainSystemComponents.PORTRAIT(),
      drawer: new mainSystemComponents.DRAWER(),
      main: mainSystemComponents.MAIN.map(component => new component()),
    }

    html.appendChild(this.components.weaponSets.element);
    html.appendChild(this.components.portrait.element);
    html.appendChild(this.components.drawer.element);
    if(this.components.movement) html.appendChild(this.components.movement.element);

    const actionHudElement = document.createElement("div");
    actionHudElement.classList.add("action-hud");
    this._buttonPanelContainer = actionHudElement;
    html.appendChild(actionHudElement);

    for (const component of this.components.main) {
      const buttonCount = await component._getButtons();
      if(buttonCount.length) actionHudElement.appendChild(component.element);
    }
    
    const promises = []
    Object.values(this.components).forEach(component => {
      if(component) Array.isArray(component) ? component.forEach(c => promises.push(c.render())) : promises.push(component.render());
    });

    await Promise.all(promises);
    this._updateActionContainers();
    this.components.combat = this.components.main.filter(component => component instanceof PassTurnPanel);
    if(!this.components.movement) this.components.portrait.element.style.marginRight = "0px";
    return element;
  }

  bind(target) {
    if (!target) {
      this.toggleUiElements(false);
      return this.close();
    }
    this._itemButtons = [];
    if (target instanceof Token || target instanceof TokenDocument) {
      this._actor = target.actor;
      this._token = target instanceof Token ? target : target.object;
    }
    else if (target instanceof Actor) {
      this._actor = target;
      this._token = target.token ?? target.parent ?? target.getActiveTokens()[0] ?? null;
    }
    else {
      throw new Error("Invalid argument");
    }
    if (!this._actor) console.error("Argon: No actor found");
    this.toggleUiElements(true);
    this.render(true);
  }

  toggleUiElements(toggle) {
    const hideMacroPlayers = game.settings.get("enhancedcombathud", "hideMacroPlayers");
    if(!hideMacroPlayers) toggle = false;
    const hotbar = document.querySelector("#hotbar");
    const fps = document.querySelector("#fps");
    const players = document.querySelector("#players");
    [hotbar, fps, players].filter(element => element).forEach(element => {
      element.classList.toggle("ech-hidden", toggle);
    });
  }

  collapseAllPanels() {
    this.element[0].querySelectorAll(".features-container.show").forEach(element => {
      element.classList.remove("show");
    });
  }

  toggleMinimize(forceState) {
    const body = document.body;
    const html = this.element[0];
  
    const isMinimizeEchHud = body.classList.contains("minimize-ech-hud");

    const newState = forceState ?? !isMinimizeEchHud;
  
    body.classList.toggle("minimize-ech-hud", newState);
    html.classList.toggle("minimize-hud", newState);

    this.setPosition();
  }

  setPosition() {
    const html = this.element[0];
  
    const isMinimizeHud = html.classList.contains("minimize-hud");
  
    const echHUDWidth = html.offsetWidth;
    const windowWidth = window.innerWidth - 340;
    const scale = true // game.settings.get("enhancedcombathud", "noAutoscale")
      ? game.settings.get("enhancedcombathud", "scale")
      : (1 / (echHUDWidth / windowWidth)) * game.settings.get("enhancedcombathud", "scale");
  
    const position = {
      bottom: isMinimizeHud ? "0px" : `${game.settings.get("enhancedcombathud", "botPos")}px`,
      transform: isMinimizeHud ? `scale(${scale > 1 ? 1 : scale}) translateY(100%)` : `scale(${scale > 1 ? 1 : scale})`,
      width: `calc(100vw * ${scale < 1 ? 1 + parseFloat(1 - scale) * 1 : 1})`,
    };
  
    for (let prop in position) {
      html.style[prop] = position[prop];
    }
  }

  performModuleCheck() {
    const systemModule = game.modules.get(`enhancedcombathud-${game.system.id}`);
    if (systemModule?.active) return;
    const systemModuleElement = `<a href="https://foundryvtt.com/packages/enhancedcombathud-${game.system.id}" target="_blank">Argon - Combat HUD (${game.system.id.toUpperCase()})</a>`;
    ui.notifications.error(localize("enhancedcombathud.err.moduleNotActive").replace("%m", systemModuleElement), {permanent: true});
  }

  static definePortraitPanel(panel) {
    mainSystemComponents.PORTRAIT = panel;
  }

  static defineDrawerPanel(panel) {
    mainSystemComponents.DRAWER = panel;
  }

  static defineMainPanels(panels) {
    mainSystemComponents.MAIN.push(...panels);
  }

  static defineWeaponSets(weaponSets) {
    mainSystemComponents.WEAPONSETS = weaponSets;
  }

  static defineMovementHud(movementHud) {
    mainSystemComponents.MOVEMENT = movementHud;
  }

  static get ARGON() {
    return {
      CORE: {
        CoreHUD,
        ArgonTooltip,
        ArgonComponent,
      },
      MAIN: {
        BUTTONS: {
          ActionButton,
          ButtonPanelButton,
          ItemButton,
          SplitButton,
        },
        ActionPanel,
        BUTTON_PANELS: {
          ButtonPanel,
          ACCORDION: {
            AccordionPanel,
            AccordionPanelCategory,
          }
        }
      },
      PORTRAIT: {
        PortraitPanel,
      },
      DRAWER: {
        DrawerButton,
        DrawerPanel,
      },
      WeaponSets,
      MovementHud,
      PREFAB: {
        PassTurnPanel,
      }
    }
  }

  static setColorSettings() {
    Object.flatten = function (data) {
      var result = {};
      function recurse(cur, prop) {
        if (Object(cur) !== cur) {
          result[prop] = cur;
        } else if (Array.isArray(cur)) {
          for (var i = 0, l = cur.length; i < l; i++)
            recurse(cur[i], prop + "[" + i + "]");
          if (l == 0) result[prop] = [];
        } else {
          var isEmpty = true;
          for (var p in cur) {
            isEmpty = false;
            recurse(cur[p], prop ? prop + "." + p : p);
          }
          if (isEmpty && prop) result[prop] = {};
        }
      }
      recurse(data, "");
      return result;
    };
    function setThemeColors(colors) {
      Object.entries(Object.flatten(colors)).forEach(([key, value]) => {
        document.documentElement.style.setProperty(
          `--ech-${key.replace(/\./g, "-")}`,
          value
        );
      });
    }

    let theme = game.settings.get("enhancedcombathud", "echThemeData");

    if (theme.theme == "custom") {
      setThemeColors(theme.colors);
    } else {
      fetch(`./modules/enhancedcombathud/scripts/themes/${theme.theme}.json`)
        .then((response) => response.json())
        .then((colors) => {
          setThemeColors(colors);
        });
    }
  }
}