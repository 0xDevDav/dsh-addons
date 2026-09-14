# dsh-locale-it

Italian (`it`) language pack for the DeepSeek Harness web GUI.

- Registers the `it` language with the client `locale` service (fallback `en`).
- Registers 1257 translated strings across 42 locale namespaces.
- Adds nothing to the host plane and changes no shipped package.

## Use

The pack is installed as a profile bundle, so its row mounts on every start:

```
dsh plugin --profile web add <path to this directory>
```

Select **Impostazioni → Generale → Lingua → Italiano**, or set the durable
preference once in `$DSH_HOME/settings.yaml`:

```yaml
locale:
  preference: it
```

## Coverage

Every key of every shipped client locale namespace is translated. Keys added by
a newer DSH release than this pack fall back to English instead of showing a raw
key. Host-plane copy that never enters the client locale registry — provider
model names, tool names, plugin configuration field labels — stays as the host
supplies it.
