---
layout: post
title:  "actual JNIC/AOT reversing notes"
description: "meow?"
pubDate:   "March 05 2024"
categories: reversing
tags: easy JNIC reversing java cpp
---
> this post is still a W.I.P :p

> `the function ptr and string decryption have been reworked with recent versions after alot of downtime from the developers, it marks a shift in JNIC's priorities, focusing more on obfuscation than support and transpilation with new competitive competition (JNT)`
---

### Obvious terms for not so obvious reasons
- jni -> java native interface
- jvm -> java virtual machine (used interchangeably to describe java functionality)
- ptr -> pointer
- dynamic reversing -> reversing at runtime
- static reversing -> reversing without running the binary
- mixin -> java version of user hooks/reflection
- disasm -> dissasembly view, the assembly instructions
- insn(s) -> instruction(s)
- decomp -> decompiler view, the psuedo code predicted from the isns
- transpiler -> converting one language src/machine code into another language's src/machine code

> i highly recommend reading [aprl.pet/reversing-jni](https://aprl.pet/writing/reversing-jni-part-1/) first <3
---
## Why
No one really does writeups on reversing cheats clientside protection and authentication systems, and there are especially no good jni resources (i had to use android jni reversing notes to learn)

The masses want to learn how to reverse beloved minecraft malware and i will give them what little knowledge i have (you would be surprised how many dms i get)

---
## Intro
This post will be primarily focusing on `JNIC v3.5.1`[^1] as that is what version the sample was when analysed (even at time of analysis this was a slightly outdated version).
[^1]: Some excerpts are from the latest version at the time of writing -- JNIC v3.7.0

> `update: an updated version of this post will follow with analysis of a sample on the most recent version`

\
The sample is a fake "dupetoolkit" mod that has spread across the mc cheating community with views totaling over 1mil, and the owner (known by mutuals) has apparently over 500 clients on their c[^2].
[^2]: SRC: larp masters

This individual has inspired many like-minded very employed individuals to spread positivity and love with their own shitty native transpiled stealers![^3]
[^3]: The same 3 samples using native now float through minecraft exploit communities, the abuse reports? unseen.

We will not be going into detail for the stages after or anything else relating to this sample but the `JNIC` library.

---
`JNIC` to me cannot be considered a "native obfuscator" but only a native transpiler with simple runtime xor string encryption. Version `3.6.0` does shift in perspective though, and i think the main selling point of `JNIC` is its compatability and support with already obfuscated binaries.

As with any `AOT` binaries, once reversed it is far easier to understand the codebase and logic since it gives you a `psudeo higher level language` through the `jni/jvm` calls.

The best jni libs ive seen use a mix of both jvm and native api functions, eg. `dont use java sockets if your transpiling your communication to native`, in my opinion, it is way better to write that natively; unfortunately to my knowledge, `JNIC` does not allow modification to the native src or it as atleast against best practice.

`Prestige client` balances this well with a good, seemingly custom, packer but many parts look llm generated (stinky) and there will be a writeup on that client itself as the native lib is custom and interesting with many areas to improve.

They do their communication through wsa and not java calls like every other jni lib.

`Prestige client` also has a interesting way of using the same native library across loader and client with a sort of handoff.

> Minecraft client devs should learn to stop crutching native because the community often does not know how to reverse native binaries and should focus on learning proper client <-> server communication, server authority, protection and drm; proactively and reactively.

> If you want to learn how to reverse and crackmes are boring, get random cheat loaders in a vm; spoofers are always the worst protection (keyauth :3)

---
## Dropper/Loader stage
> `exclusive to sample not jnic`

The dropper is a simple fabric mod with a fake embedded dependency (stage 2) that actually contains the malware, and subsequently the `JNIC` native.

The 2nd stage embedded is also a fabric mod, the details of which aren't relevant for the topic but the main logic is only present in `ExampleMod` with 2 mixins that dont seem used and look autofilled from the template.

Although one mixin is of interest -- `MinecraftServer.loadWorld()` is marked as native.
>This is primarily why i chose this sample for a writeup, a small codebase with very few natives (because this native is again, used as another dropper).

---
## Initialisation / keystream | JNI_OnLoad
`JNI_OnLoad` is the "java" entrypoint and is what advertises `JNIC`, the version and initialises the `keystream` used to decrypt the strings in the native lib.

```cpp
jint JNI_OnLoad(JavaVM *vm, void *reserved) {}
```

The `keystream` is a ptr to the java `ByteBuffer` initialised within the `JNICLoader` class. The `keystream` is initialised with certain int numbers, used in the `ChaCha20`[^4] algorithm.
[^4]: https://jnic.dev/documentation/#stringobf

The stack variable containing the `keystream` ptr can be found directly above the first `cmp` instruction, find the operand in the disasm and the value written is the ptr to the keystream; or in the decomp it will inline the ptr above the first/topmost `do while` loop.

Java Initialisation:
```java
public class JNICLoader extends InputStream {
   public static ByteBuffer z;
   ...
   if (var0.contains("win") && var1.equals("aarch64")) {
     var2 = 506880L;
     var4 = 970240L;
     // the nonce values
     z.putInt(-325934867);
     z.putInt(-1796564512);
     z.putInt(86162358);
     z.putInt(137883887);
     z.putInt(1625553484);
     z.putInt(1963368029);
     z.putInt(922207258);
     z.putInt(-1772791943);
  }

  if (var0.contains("win") && (var1.equals("x86_64") || var1.equals("amd64"))) {
     var2 = 0L;
     var4 = 506880L;
     // the nonce values
     z.putInt(-1200696756);
     z.putInt(-592176884);
     z.putInt(-1136343657);
     z.putInt(-1621046469);
     z.putInt(1821978264);
     z.putInt(-1370484180);
     z.putInt(1196660769);
     z.putInt(849921994);
  }
```
---
Native Counterpart:
```cpp
  (*(*vm)->GetEnv)(vm,&env,0x10006);
  jnicLoaderClass = (*(*env)->FindClass)(env,"dev/jnic/GAoMnN/JNICLoader");
  bytebufFieldID = (*(*env)->GetStaticFieldID)(env,jnicLoaderClass,"z","Ljava/nio/ByteBuffer;");
  buf = (*(*env)->GetStaticObjectField)(env,jnicLoaderClass,bytebufFieldID);
  keystreamBuf = (*(*env)->GetDirectBufferAddress)(env,buf);
  state_s0_const0 = *(uint *)PTR_s_jnic.dev_v3.7.0_18007e000;
  state_s1_const1 = *(uint *)(PTR_s_jnic.dev_v3.7.0_18007e000 + 4);
  state_s2_const2 = *(uint *)(PTR_s_jnic.dev_v3.7.0_18007e000 + 8);
  state_s3_const3 = *(uint *)(PTR_s_jnic.dev_v3.7.0_18007e000 + 0xc);
  state_s4s5_key0 = 0xfa592a0b679ac6c7;
  state_s6s7_key1 = 0xff854713ec933cfc;
  state_s8s9_key2 = 0x9720746395e4d3b4;
  state_s10s11_key3 = 0x4a49a780b08235cd;
  state_s12_counter = 0;
  nonce0_raw = *(uint *)((longlong)keystreamBuf + 0x20);
  state_s14_nonce1 = *(uint *)((longlong)keystreamBuf + 0x24);
  state_s15_nonce2 = *(uint *)((longlong)keystreamBuf + 0x28);
  local_88 = 0x40;
  state_s13_nonce0 = nonce0_raw;
  init_s0 = state_s0_const0;
  init_s1 = state_s1_const1;
  init_s2 = state_s2_const2;
  init_s3 = state_s3_const3;
  init_s14_nonce1 = state_s14_nonce1;
  init_s15_nonce2 = state_s15_nonce2;
  keystreamBuf = malloc(0x9772);
  block_byte_idx = 0x40;
  counter_lo = 0;
  lVar4 = 0;
  jnicKeystream = keystreamBuf;                                     
  do {
  
  /* ChaCha20 logic */
          ...
  
  return 0x10006;
```

---
\
In summary it:
- retrieves the nonce/init values from the Java side (through the bytebuf shared reference)
- builds the ChaCha20 initial state
```
s[0..3]  = " jnic.dev v3.7.0"   (custom constant, replaces "expand 32-byte k")
s[4..7]  = chacha20_key_lo       (256-bit hardcoded key, low 128 bits)
s[8..11] = chacha20_key_hi       (256-bit hardcoded key, high 128 bits)
s[12]    = counter               (0, incremented per 64-byte block)
s[13]    = nonce[0]              (from ByteBuffer+0x20)
s[14]    = nonce[1]              (from ByteBuffer+0x24)
s[15]    = nonce[2]              (from ByteBuffer+0x28)
```
- generates the keystream from 10 double-rounds
- return JNI_VERSION_1_6 (0x10006)
---

\
I have developed Ghidra plugins to transform and help the `JNIC` reversing process that may be released on my gitea.
Including a script to fully generate the `keystream` statically, although it is easier to dump dynamically.

Before i developed the `keystream` script i purposely chose to make this the **only** dynamic part of the reversing process; of course with any reversing you should do a mix of both dynamic and static reversing but i wanted a "challenge" from the legendary "obfuscation" that nef resold for ~3 years

~~I have plans to try make a tool to only dynamically execute the `JNI_OnLoad` and nothing else while automatically dumping the keystream for the user; update soon:tm:~~
~~` i already have a tool to statically recreate the keystream, although not a bad premise to safely execute the entrypoint to dump the keystream`~~

---
## Codebase
Most jvm functions are in wrapper/helper subroutines where it is checked if the classes reference is already initialised - if not, the class and all that classes methods used anywhere in the binary are retrieved through jni calls, and each stored as a global/static reference; a generic lazy singleton initalisation with a mutex, so all "standard library" jvm and other methods and classes are only resolved once.

These are present at the top of every native method counterpart.
To reverse these functions, find what class and methods it is initialising, then rename the function and each reference, this is an integral component to understanding the flow of the native method.

Again each one of these functions initialise one class and its methods, its 1-1 to each class used, these "ref helper" methods are the first functions you should focus on.

eg. a natively transpiled method uses `System.exec()`[^5], -> the mutex locks and function call that retuns `jclass` at the top of this native method will check if `java/lang/Runtime` has a global reference initialised.
If not it will use `env->FindClass` and `env->NewGlobalRef` to reference the class and all the methods used.

A suitable name for this function might be `java_lang_Runtime_RefInit`, if you change the label for all the globals in this function the native method will become incredibly easy to reverse.
[^5]: https://docs.oracle.com/javase/8/docs/api/java/lang/Runtime.html#exec-java.lang.String-

```cpp
jclass getMainClass(JNIEnv *env)
{
  jclass mainClassGlobal;
  jclass tmp;
  bool initialised;
  ulonglong classname;
  ulonglong classname2;
  ushort classname3;
  jclass existing;
  
  mainClassGlobal = g_MainClass;
  if (g_MainClass == (jclass)0x0) {
    classname = *(ulonglong *)((longlong)jnicKeystream + 0x8f43) ^ 0x5fe6a794d6de8d4d;
    classname2 = *(ulonglong *)((longlong)jnicKeystream + 0x8f4b) ^ 0x888a166165b8a00d;
    classname3 = *(byte *)((longlong)jnicKeystream + 0x8f53) ^ 0xd0;
    mainClassGlobal = (*(*env)->FindClass)(env,(char *)&classname);
    mainClassGlobal = (*(*env)->NewGlobalRef)(env,mainClassGlobal);
    tmp = (jclass)0x0;
    LOCK();
    initialised = g_MainClass != (jclass)0x0;
    existing = mainClassGlobal;
    if (initialised) {
      tmp = g_MainClass;
      existing = g_MainClass;
    }
    g_MainClass = existing;
    UNLOCK();
    if (initialised) {
      (*(*env)->DeleteGlobalRef)(env,mainClassGlobal);
      mainClassGlobal = tmp;
    }
  }
  return mainClassGlobal;
}
```
---

\
Following the same practice, all the native functions for a given user defined java class are initialised in the same routine, compared to initialising them each in their respective `Java_classname` exports as seen in usual jni libraries.

Expect to see excessive exception checks and locks for stability, especially when it comes to obfuscated binaries. `Native Obfuscator` (writeup soon:tm:) utilises exception checks on almost every single jni statement.

`JNIC` seems to improve on this by opportunistically placing exception handlers on known problematic calls therefore likely improving its pre-transpiled obfuscation support.

```c
nativeobf excep handler example
```

---
## Strings


---
## Function pointers

---
## Natives registration

---