import { handleRequest, handleSession, runAlarm } from "./http.js";

export class ChatSessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  fetch(request) {
    return handleSession(request, this.state.storage, this.env, {
      setAlarm: (when) => this.state.storage.setAlarm(when),
      // One open voice call per chat session lives on this object.
      callSlot: this,
    });
  }

  alarm() {
    return runAlarm(this.state.storage, this.env, {
      setAlarm: (when) => this.state.storage.setAlarm(when),
    }, Date.now());
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, {});
  },
};
