---
layout: post
title:  "actual JNIC/AOT reversing notes"
description: "some notes on lowering, jnic keystream, string \"encryption\", transpiled methods and codebase"
pubDate:   "March 05 2024"
updatedDate: "September 06 2026"
categories: ["reversing", "java", "jni"]
tags: ["easy", "jnic", "jni", "reversing", "java", "c", "compilers"]
---
> this post is still a W.I.P :p

> `the function ptr and string decryption have been reworked with recent versions after a lot of downtime from the developers, it marks a shift in JNIC's priorities, focusing more on obfuscation than support and transpilation with new competitive competition (JNT)`
---

### Obvious terms for not so obvious reasons
<sub>all these terms will be used in future blog posts and will only be mentioned once <3</sub>
- jni -> java native interface
- jvm -> java virtual machine (used interchangeably to describe java functionality)
- ptr -> pointer
- dynamic reversing -> reversing at runtime
- static reversing -> reversing without running the binary
- mixin -> java version of user hooks/c# harmony
- disasm -> disassembly view, the assembly instructions
- decomp -> decompiler view, the pseudo code predicted from the instructions
- insn(s) -> instruction(s)
- src -> source code
- ir -> intermediate representation - an internal language/structure used by a compiler that represents the original src: java bytecode (high level & semantic), c# il, llvm ir, vtil, etc
- AOT -> ahead of time compilation - interpreted/higher language compiled into machine code/lower language, """usually""" for performance reasons
- transpiler -> converting one language's src/ir into another language's src/ir
- lowering -> converting a higher ir into a lower ir
- lifting -> converting a low ir into a higher ir

> the point (src or ir) at which transpilation gets applied has a massive difference on the resulting binary

> i highly recommend reading [aprl.pet/reversing-jni](https://aprl.pet/writing/reversing-jni-part-1/) first <3
---
## Why
- No one really does writeups on reversing cheats clientside protection/authentication systems, and there are especially no good jni resources (i had to use android jni reversing notes to learn). DRM writeups to come
- The minecraft community is ridden with malware, so naturally it is usually written in java for easy integration and because the malware devs cant code anything else. So as a prevention mechanism a lot of cheats and malware solely rely on native transpilation (also seen with il2cpp for anticheat in unity games); relying on most people within the community not knowing how to reverse native binaries
- The masses want to learn how to reverse their beloved minecraft malware and i will give them what little knowledge i have (you would be surprised how many dms i get)

---
# Intro
This post will be primarily focusing on `JNIC v3.5.1`[^1] as that is the version of the sample when analysed. Even at time of analysis this was a slightly outdated version.
[^1]: Some excerpts are from the latest version at the time of writing -- JNIC v3.7.0

> `update: an updated version of this post will follow with analysis of the new techniques seen in the most recent version`

Skip [here](#initialisation--keystream--jni_onload) if you just want the JNIC stuff.

\
The sample is a fake "dupetoolkit" mod that has spread across the mc duping community with views totaling over 1 million on youtube (the platform is used to advertise the campaign and gain foothold). The owner (known by mutuals) has apparently over 500 clients on their c[^2].
[^2]: SRC: larp masters

This individual has inspired many like-minded, very employed individuals, to spread positivity and love with their own shitty native transpiled stealers, what a great use of time![^3]
[^3]: The same 3 samples using native now float through minecraft exploit communities, the abuse reports? unseen.

That being said, we will not be going into detail for the stages after or anything else relating to this sample but the `JNIC` library.\
These malware variants and IoCs are always the same and the malware is not the purpose of this blog post.

---
# JNIC Rant
`JNIC`, despite what it sells itself as, is not really a "native obfuscator" but a native transpiler with very simple anti reversal techniques to prevent entry level reversers from just using the decompiler.

Version `3.6.0` does shift in perspective though, and i think the main selling point of `JNIC` is its compatability and support with pre-obfuscated java applications.\
Newer `JNIC` versions are more oriented towards better anti reversal and obfuscation techniques, but these are still only used to throw off decompilation and require minimal custom tooling.

---
# Transpiler Rant
Java "transpiler" samples are easier to reverse than most, as the transpilers use `jni/jvm` calls to perform the given logic.\
These calls act as semantic breadcrumbs, exposing the original high level intent. When using the decomp it feels like you are looking at a high level ir.

AOT usually does not exhibit this same behaviour, as AOT usually focuses on lowering instead of creating direct semantic equivalency.\
This semantic equivalency makes java transpilers different, easy to reverse and interesting (atleast to me :3).\
Most AOT binaries do still expose the original logic with required runtime calls and similar patterns.

All of these factors make the samples easier to reverse in my opinion (writeup for il2cpp soon ;3).\
The best jni libs ive seen use a mix of both jvm and native api functions.\
e.g \- `dont use java calls if you are transpiling your communication to native`\
In my opinion, it is way better to write certain components natively even when using transpilers; unfortunately to my knowledge, when using certain transpilers modification to the native src/ir is difficult or it is at least against best practice.

`Prestige client` balances this well with a good, seemingly custom, packer applied top of a custom jni binary with many core components written natively while other, less security oriented, routines are transpiled. This being said, many parts look llm generated (stinky) and there will be a writeup on that client itself as the native lib is technical, interesting yet flawed with many areas to expand upon.

tldr \- they do their communication through winsock winapi calls and not jvm calls like every other jni library.

`Prestige client` also has a interesting way of using the same native library across loader and client with a handoff between them.

> Minecraft client devs should focus on learning proper client <-> server communication, server authority, protection and drm; proactively and reactively, instead of relying on obscurity

> If you want to learn how to reverse and crackmes are boring, get random cheat loaders in a vm; spoofers are always the worst protection (keyauth :3) and easy to find.\
> Just write emulation or easy hooks, do random stuff and learn something, its the best way

---
# Dropper/Loader stage
The dropper is a simple fabric mod with a fake embedded dependency (stage 2) that actually contains the malware, and the `JNIC` native.\
The 2nd stage embedded is also a fabric mod, the details of which aren't relevant for the topic but the main logic is present in `ExampleMod`. Containing 2 mixins that dont seem used and also look autofilled from the fabric mod template.

Although one mixin is of interest -- `MinecraftServer.loadWorld()` is marked as native.
> This is primarily why i chose this sample for a writeup, a small codebase with very few natives (because this native is again, used as another dropper).

Now to actually talk about `JNIC` (sorry)

---
# Initialisation / keystream | JNI_OnLoad
The `JNICLoader` class, present in every `JNIC` sample, decompresses, initialises and loads the platform specific library.

Moving onto the library:\
`JNI_OnLoad`[^4] is the entrypoint. In `JNIC` it is also what advertises `JNIC`, the version used and initialises the `keystream` used to decrypt the strings in the native library.
[^4]: https://docs.oracle.com/en/java/javase/25/docs/specs/jni/invocation.html#jni_onload

```cpp
jint JNI_OnLoad(JavaVM *vm, void *reserved) {}
```

The `keystream` is a ptr to the java `ByteBuffer` initialised within the `JNICLoader` class.\
The `keystream` is initialised with certain random integers (nonce values) from the java side, which are then used in the `ChaCha20`[^5] algorithm implementation on the native side.\
This string encryption is disabled by default but will be the primary topic talked about as it is the only obfuscation technique present in this `JNIC` version. 
[^5]: https://JNIC.dev/documentation/#stringobf

---
Java Initialisation:
```java
public class JNICLoader extends InputStream {
   public static ByteBuffer z;
   ...
   if (var0.contains("win") && var1.equals("aarch64")) {
     // offsets for loading the native library for each platform
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
     // win_x86_64 starts at 0 to file offset 506880
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
\
Native Counterpart:
```cpp
  // get the jni interface
  (*(*vm)->GetEnv)(vm,&env,0x10006);
  // get the class above to find the bytebuffer `z`
  JNICLoaderClass = (*(*env)->FindClass)(env,"dev/JNIC/GAoMnN/JNICLoader");
  // find the field containing the buffer
  bytebufFieldID = (*(*env)->GetStaticFieldID)(env,JNICLoaderClass,"z","Ljava/nio/ByteBuffer;");
  // get the value
  buf = (*(*env)->GetStaticObjectField)(env,JNICLoaderClass,bytebufFieldID);
  // get a pointer to the buffer so we can manipulate it natively
  keystreamBuf = (*(*env)->GetDirectBufferAddress)(env,buf); // get a ptr to the java defined keystream
  
  // initialise the ChaCha20 state
  state_s0_const0 = *(uint *)PTR_s_JNIC.dev_v3.7.0_18007e000;
  state_s1_const1 = *(uint *)(PTR_s_JNIC.dev_v3.7.0_18007e000 + 4);
  state_s2_const2 = *(uint *)(PTR_s_JNIC.dev_v3.7.0_18007e000 + 8);
  state_s3_const3 = *(uint *)(PTR_s_JNIC.dev_v3.7.0_18007e000 + 0xc);
  state_s4s5_key0 = 0xfa592a0b679ac6c7;
  state_s6s7_key1 = 0xff854713ec933cfc;
  state_s8s9_key2 = 0x9720746395e4d3b4;
  state_s10s11_key3 = 0x4a49a780b08235cd;
  state_s12_counter = 0;
  // retrieve the nonces existing in the buffer
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
  
  // clear the buffer of the existing data and nonces as anything needed is now on the stack
  keystreamBuf = malloc(0x9772); // the size of the keystream, therefore indicative to the amount of strings
  block_byte_idx = 0x40;
  counter_lo = 0;
  lVar4 = 0;
  JNICKeystream = keystreamBuf; // JNICKeystream is the ptr used throughout the library for decryption
  do {
  
  /* ChaCha20 logic */
          ...
  
  return 0x10006; // JNI_VERSION_1_6 - JNI_OnLoad returns the JNI_VERSION
```

---
In summary it:
- retrieves the nonce/init values from the Java side (through the already populated bytebuffer shared reference)
- builds the `ChaCha20` initial state
```
s[0..3]  = " JNIC.dev v3.7.0"    (custom constant, replaces "expand 32-byte k")
s[4..7]  = chacha20_key_lo       (256-bit hardcoded key, low 128 bits)
s[8..11] = chacha20_key_hi       (256-bit hardcoded key, high 128 bits)
s[12]    = counter               (0, incremented per 64-byte block)
s[13]    = nonce[0]              (from ByteBuffer+0x20)
s[14]    = nonce[1]              (from ByteBuffer+0x24)
s[15]    = nonce[2]              (from ByteBuffer+0x28)
```
- generates the keystream from 10 double-rounds
- returns the jni version required for certain functions `JNI_VERSION_1_6` (0x10006)

> 'In order to make use of functions defined at a certain version of the JNI API, JNI_OnLoad must return a constant defining at least that version. For example, libraries wishing to use AttachCurrentThreadAsDaemon function introduced in JDK 1.4, need to return at least JNI_VERSION_1_4.'
[^4]
---

# Dumping the keystream
The variable containing the `keystream` ptr can be found directly above the first `cmp` instruction, find the operand in the disasm, the value written is the ptr to the `keystream`; or in the decomp it will inline the ptr above the first/topmost `do while` loop.

To dump the `keystream` at runtime, dump this memory region after the `ChaCha20` rounds execute (breakpoint the return).\
In x64dbg you can save the `keystream` to a file by doing the following:

1. Right click the `keystream` address, choose `Follow in Memory Map`
2. Right click the region selected and choose `Dump Memory to File`.

In your disassembler load it as a segment from the file created and set the ptr to point to the base of the `keystream` segment.\
Alternatively you can reverse the program from a full dump

\
I have developed Ghidra plugins to transform and help the `JNIC` reversing process that may be released on my gitea.
Included is a script to fully generate the `keystream` statically, although it is very easy to dump dynamically.

Before i developed the `keystream` script i purposely chose to make this the **only** dynamic part of the reversing process; of course with any reversing you should do a mix of both dynamic and static reversing but i wanted a "challenge" from the legendary "obfuscation" that nef resold for ~3 years

~~I have plans to try make a tool to only dynamically execute the `JNI_OnLoad` and nothing else while automatically dumping the keystream for the user; update soon:tm:~~
~~` i already have a tool to statically recreate the keystream, although it is not a bad premise to safely automate/emulate the execution of the entrypoint to dump the keystream`~~

---
# Function pointers

jni functions are often loaded into the stack as such:\
`CallStaticObjectMethod = (*param_1)->CallStaticObjectMethod;`\
Just rename these.

Check the exports.\
User defined native functions are slightly different.\
Each class that uses transpiled methods has an export of containing the classes name. The names usually look like this `Java_com_example_ClassName__00024jnicLoader` as is usual practice for dynamically linked jni libraries.
> Other transpilers sometimes have only one export to register everything

Within these exports, also seen in statically linked jni libs, is a `RegisterNatives`[^9] call is performed to register each transpiled method with the jvm.\
Combining these two methods means the library can register a given classes methods without leaking the individual methods definitions through the exports; this behaviour is seen in every transpiler.
[^9]: https://docs.oracle.com/javase/8/docs/technotes/guides/jni/spec/functions.html#RegisterNatives

All the transpiled methods for a given class are registered in a array of `JNINativeMethod` structs to register the classes methods all in one call, check the jni documentation -> [`RegisterNatives`](https://docs.oracle.com/javase/8/docs/technotes/guides/jni/spec/functions.html#RegisterNatives)

The first argument in these exports is always the `JNIEnv *`.\
If you have typed the `JNIEnv` structure any types that use the `JNIEnv`, function params, return types, variable types will usually also be automatically typed your decompiler.\
Meaning the `JNINativeMethod` structs are obvious, you can: look near the bottom of the export, search for this type or look at the locals used in the `RegisterNatives` call.

```c
// string decryption for the method name
do {
    m_name[i + 4] = m_name[i + 4] ^ *(byte *)(KEYSTREAM_PTR + 0x4 + i);
    i = i + 1;
} while (i != 0x12);
methods[0].name = (char *)(m_name + 4);
  
// string decryption for the sig
do {
    m_sig[i] = m_sig[i] ^ *(byte *)(KEYSTREAM_PTR + 0x16 + i);
    i = i + 1;
} while (i != 3);
methods[0].signature._0_5_ = SUB85(m_sig,0);
methods[0].signature._5_3_ = (undefined3)((ulonglong)m_sig >> 0x28);
// ignore the string manipulation here
// ghidra has just slightly messed up, its actually just a cast to a uint64 ptr
const uint64_t sig = *(uint64_t *) m_sig;
methods[0].signature = sig;

methods[0].fnPtr._0_5_ = 0x10001000; // memory address of the function, yes really its just here
methods[0].fnPtr._5_3_ = 0;
// decomp moment again its just
// methods[0].fnPtr = 0x10001000;

// this class only has one function so the array only has one element
(*(*env)->RegisterNatives)(env,clazz,&methods,1); // num of methods
```

---
# Codebase
Most if not all jvm functions are resolved in wrapper/helper subroutines for caching purposes.\
In user native/transpiled functions, for any class/methods used, it is checked if the said class's reference is already initialised - if not, the class and all that class's methods used anywhere within the binary are retrieved through jni calls.

Each are stored as a global/static reference/ptr; this is a generic lazy singleton initialisation with a mutex, so all "standard library" jvm, other methods and classes are only resolved once and cached.

When reversing these caching functions, find what class and methods it is initialising, rename the functions and each reference, this is an integral component to understanding the flow of the caller / transpiled method.\
Once done, it will make reversing the binary and its transpiled methods trivial.

Again each one of these caching functions initialise one class and all that classes used methods, it is 1-1 for each class used, so there may be multiple used within a transpiled method. These "ref/cache helper" methods are the first functions you should focus on.

e.g \- a transpiled method uses the java std call `System.exec()`[^5], -> the mutex lock and function call that returns `jclass` at the top of this transpiled method will be the resolve cache function. It will check if `java/lang/Runtime` already has a global reference initialised.\
If not it will use `env->FindClass` and `env->NewGlobalRef` to reference the class itself and all the methods for that class used within the library.
[^5]: https://docs.oracle.com/javase/8/docs/api/java/lang/Runtime.html#exec-java.lang.String-

A suitable name for this function might be `java_lang_Runtime_RefInit`.
I rename jvm methods, classes, fields and RefInit functions to be reflective of the class so it is not ambiguous. Commenting the reference with the callers and context for use can also be helpful.

I also recommend using the `FunctionStringAssociate` plugin or an alternative, to automatically comment function xrefs/calls with the strings within that function (java class and method names in this case), for readability.

---
Example reference init function as pseudocode:
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
    // the great string decryption
    classname = *(ulonglong *)((longlong)JNICKeystream + 0x8f43) ^ 0x5fe6a794d6de8d4d;
    classname2 = *(ulonglong *)((longlong)JNICKeystream + 0x8f4b) ^ 0x888a166165b8a00d;
    classname3 = *(byte *)((longlong)JNICKeystream + 0x8f53) ^ 0xd0;
    
    mainClassGlobal = (*(*env)->FindClass)(env,(char *)&classname);
    mainClassGlobal = (*(*env)->NewGlobalRef)(env,mainClassGlobal);
    
    tmp = (jclass)0x0;
    LOCK();
    existing = g_MainClass != (jclass)0x0;
    newObj = mainClassGlobal;
    if (existing) {
      tmp = g_MainClass;
      newObj = g_MainClass;
    }
    g_MainClass = newObj;
    UNLOCK();
    
    if (existing) {
      (*(*env)->DeleteGlobalRef)(env,mainClassGlobal);
      mainClassGlobal = tmp;
    }
  }
  return mainClassGlobal;
}
```
---

\
Expect to see excessive exception checks and locks for stability, especially when it comes to obfuscated binaries.\
`Native Obfuscator` (writeup soon:tm:) utilises exception checks on almost every single jni statement; this is a little too excessive and may cause instability on obfuscated code.\
`JNIC` seems to improve on this by opportunistically placing exception handlers on known problematic calls therefore likely improving its pre-transpiled obfuscation support and reducing unnecessary overhead.

```c
nativeobf excep handler example
```

---
# Strings
```asm
; certain things have been renamed even when they shouldnt
; e.g it loads the keystream into param1 which contains the jni env
; after the decryption, the jni env is copied back into param1

; (*env)->NewString
1000133d 48 8b 06        MOV        RAX,qword ptr [RSI]
10001340 48 8b 80        MOV        RAX,qword ptr [RAX + 0x518]
         18 05 00 00

; cipher text, constant values
10001347 c7 44 24        MOV        dword ptr [RSP + cipher_text],0xd4bb5a7b
         69 7b 5a 
         bb d4
1000134f 66 c7 44        MOV        word ptr [RSP + cipher_textb],0x9116
         24 6d 16 91
10001356 c6 44 24        MOV        byte ptr [RSP + cipher_text9],0x0 ; null terminator
         6f 00
         
1000135b 31 c9           XOR        i,i
1000135d 48 8b 15        MOV        keystream,qword ptr [KEYSTREAM_PTR]
         54 ed 00 00

         string_xor_loop                                    XREF[1]:     10001375(j)  
10001364 44 8a 44        MOV        R8B,byte ptr [keystream + i*0x1 + 0x1d] 
         0a 1d                      ; key for this cipher text is at offset 0x1d
10001369 44 30 44        XOR        byte ptr [RSP + i*0x1 + cipher_text+0x1],R8B
         0c 69                      ; R8b is the byte from keystream 
1000136e 48 ff c1        INC        i
10001371 48 83 f9 06     CMP        i,0x6 ; length of the string
10001375 75 ed           JNZ        string_xor_loop ; jump/loop again if i is not 6

; call (*env)->NewString with the decrypted string
1000137c 48 89 f1        MOV        i,RSI
1000137f 41 b8 03        MOV        R8D,0x3 ; length of the string
         00 00 00                           ; (sometimes it decrypts more than needed and substrings) 
10001385 ff d0           CALL       RAX ; (*env)->NewString was moved into RAX earlier :3

```

As you can see the string decryption is the boilerplate stack string xor decryption.\
It loads the cipher text onto the stack from the constant values, copies the `keystream_ptr` into param2 and 
then xors each cipher byte with a corresponding byte from the keystream for the length of the string, in this case 6 bytes/chars.
The offset into they keystream for the key being `0x1d` in this case.
It then initialises this as a string with the jvm by calling `NewString`[^7].
[^7]: https://docs.oracle.com/javase/8/docs/technotes/guides/jni/spec/functions.html#NewString

pseudocode:
```c
cipher_text = 0xd4bb5a7b;
cipher_textb = 0x9116;
cipher_text9 = 0;
i = 0;
do {
  *(byte *)(cipher_text + i) =
       *(byte *)(cipher_text + i) ^ *(byte *)(KEYSTREAM_PTR + 0x1d + i);
  i = i + 1;
} while (i != 6); // length of the string
```

---
# Retro
That's pretty much it for `JNIC v3.5.1`, there aren't many anti reversal techniques and there isn't much to talk about :/\
More detail on later versions, new techniques and some IoCs for popular `JNIC` malware will follow in the next blog post perhaps :3
