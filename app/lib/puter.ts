import { create } from "zustand";

declare global {
  interface Window {
    puter: {
      auth: {
        getUser: () => Promise<PuterUser>;
        isSignedIn: () => Promise<boolean>;
        signIn: () => Promise<void>;
        signOut: () => Promise<void>;
      };
      fs: {
        write: (
          path: string,
          data: string | File | Blob
        ) => Promise<File | undefined>;
        read: (path: string) => Promise<Blob>;
        upload: (file: File[] | Blob[]) => Promise<FSItem>;
        delete: (path: string) => Promise<void>;
        readdir: (path: string) => Promise<FSItem[] | undefined>;
      };
      ai: {
        chat: (
          prompt: string | ChatMessage[],
          imageURL?: string | PuterChatOptions,
          testMode?: boolean,
          options?: PuterChatOptions
        ) => Promise<Object>;
        img2txt: (
          image: string | File | Blob,
          testMode?: boolean
        ) => Promise<string>;
      };
      kv: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        list: (pattern: string, returnValues?: boolean) => Promise<string[]>;
        flush: () => Promise<boolean>;
      };
    };
  }
}

interface PuterStore {
  isLoading: boolean;
  error: string | null;
  puterReady: boolean;
  auth: {
    user: PuterUser | null;
    isAuthenticated: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<void>;
    checkAuthStatus: () => Promise<boolean>;
    getUser: () => PuterUser | null;
  };
  fs: {
    write: (
      path: string,
      data: string | File | Blob
    ) => Promise<File | undefined>;
    read: (path: string) => Promise<Blob | undefined>;
    upload: (file: File[] | Blob[]) => Promise<FSItem | undefined>;
    delete: (path: string) => Promise<void>;
    readDir: (path: string) => Promise<FSItem[] | undefined>;
  };
  ai: {
    chat: (
      prompt: string | ChatMessage[],
      imageURL?: string | PuterChatOptions,
      testMode?: boolean,
      options?: PuterChatOptions
    ) => Promise<AIResponse | undefined>;
    feedback: (
      path: string,
      message: string
    ) => Promise<AIResponse | undefined>;
    img2txt: (
      image: string | File | Blob,
      testMode?: boolean
    ) => Promise<string | undefined>;
    validateResume: (imageFile: File | Blob) => Promise<{ isResume: boolean; reason?: string }>;
  };
  kv: {
    get: (key: string) => Promise<string | null | undefined>;
    set: (key: string, value: string) => Promise<boolean | undefined>;
    delete: (key: string) => Promise<boolean | undefined>;
    list: (
      pattern: string,
      returnValues?: boolean
    ) => Promise<string[] | KVItem[] | undefined>;
    flush: () => Promise<boolean | undefined>;
  };

  init: () => void;
  clearError: () => void;
}

const getPuter = (): typeof window.puter | null =>
  typeof window !== "undefined" && window.puter ? window.puter : null;

export const usePuterStore = create<PuterStore>((set, get) => {
  // Helper to add a timeout to platform calls to avoid indefinite hangs
  const withTimeout = async <T,>(p: Promise<T>, ms: number, name?: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${name || 'operation'} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]) as T;
    } finally {
      clearTimeout(timer!);
    }
  };
  const setError = (msg: string) => {
    set({
      error: msg,
      isLoading: false,
      auth: {
        user: null,
        isAuthenticated: false,
        signIn: get().auth.signIn,
        signOut: get().auth.signOut,
        refreshUser: get().auth.refreshUser,
        checkAuthStatus: get().auth.checkAuthStatus,
        getUser: get().auth.getUser,
      },
    });
  };

  const checkAuthStatus = async (): Promise<boolean> => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const isSignedIn = await puter.auth.isSignedIn();
      if (isSignedIn) {
        const user = await puter.auth.getUser();
        set({
          auth: {
            user,
            isAuthenticated: true,
            signIn: get().auth.signIn,
            signOut: get().auth.signOut,
            refreshUser: get().auth.refreshUser,
            checkAuthStatus: get().auth.checkAuthStatus,
            getUser: () => user,
          },
          isLoading: false,
        });
        return true;
      } else {
        set({
          auth: {
            user: null,
            isAuthenticated: false,
            signIn: get().auth.signIn,
            signOut: get().auth.signOut,
            refreshUser: get().auth.refreshUser,
            checkAuthStatus: get().auth.checkAuthStatus,
            getUser: () => null,
          },
          isLoading: false,
        });
        return false;
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to check auth status";
      setError(msg);
      return false;
    }
  };

  const signIn = async (): Promise<void> => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }

    set({ isLoading: true, error: null });

    try {
      await puter.auth.signIn();
      await checkAuthStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setError(msg);
    }
  };

  const signOut = async (): Promise<void> => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }

    set({ isLoading: true, error: null });

    try {
      await puter.auth.signOut();
      set({
        auth: {
          user: null,
          isAuthenticated: false,
          signIn: get().auth.signIn,
          signOut: get().auth.signOut,
          refreshUser: get().auth.refreshUser,
          checkAuthStatus: get().auth.checkAuthStatus,
          getUser: () => null,
        },
        isLoading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign out failed";
      setError(msg);
    }
  };

  const refreshUser = async (): Promise<void> => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const user = await puter.auth.getUser();
      set({
        auth: {
          user,
          isAuthenticated: true,
          signIn: get().auth.signIn,
          signOut: get().auth.signOut,
          refreshUser: get().auth.refreshUser,
          checkAuthStatus: get().auth.checkAuthStatus,
          getUser: () => user,
        },
        isLoading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to refresh user";
      setError(msg);
    }
  };

  const init = (): void => {
    const puter = getPuter();
    if (puter) {
      set({ puterReady: true });
      checkAuthStatus();
      return;
    }

    const interval = setInterval(() => {
      if (getPuter()) {
        clearInterval(interval);
        set({ puterReady: true });
        checkAuthStatus();
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      if (!getPuter()) {
        setError("Puter.js failed to load within 10 seconds");
      }
    }, 10000);
  };

  const write = async (path: string, data: string | File | Blob) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.fs.write(path, data), 20000, 'fs.write');
  };

  const readDir = async (path: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.fs.readdir(path), 20000, 'fs.readdir');
  };

  const readFile = async (path: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.fs.read(path), 20000, 'fs.read');
  };

  const upload = async (files: File[] | Blob[]) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.fs.upload(files), 30000, 'fs.upload');
  };

  const deleteFile = async (path: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.fs.delete(path), 10000, 'fs.delete');
  };

  const chat = async (
    prompt: string | ChatMessage[],
    imageURL?: string | PuterChatOptions,
    testMode?: boolean,
    options?: PuterChatOptions
  ) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(
      puter.ai.chat(prompt, imageURL, testMode, options) as Promise<AIResponse | undefined>,
      60000,
      'ai.chat'
    );
  };

  const feedback = async (path: string, message: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "file",
            puter_path: path,
          },
          {
            type: "text",
            text: message,
          },
        ],
      },
    ];

    const modelCandidates = [
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-flash",
    ];

    let lastError: unknown;

    for (const model of modelCandidates) {
      try {
        const response = await withTimeout(
          puter.ai.chat(messages, { model, stream: false }) as Promise<AIResponse | undefined>,
          120000,
          `ai.feedback:${model}`
        );

        if (response) {
          return response;
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("All AI model attempts failed");
  };

  const img2txt = async (image: string | File | Blob, testMode?: boolean) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.ai.img2txt(image, testMode), 45000, 'ai.img2txt');
  };

  const validateResume = async (imageFile: File | Blob): Promise<{ isResume: boolean; reason?: string }> => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return { isResume: false, reason: "Puter not available" };
    }

    try {
      // Step 1: Extract text from image using OCR
      const extractedText = await withTimeout(
        puter.ai.img2txt(imageFile, false),
        45000,
        'ai.img2txt'
      ) as string | undefined;

      if (!extractedText || extractedText.trim().length < 50) {
        return { isResume: false, reason: "Could not extract text from document" };
      }

      // Step 2: Use a quick classification prompt with a fast model
      const classificationPrompt = `You are a document classifier. 
Analyze the following extracted text and determine if it's a resume/CV or not.

Extracted text:
${extractedText.substring(0, 1000)}

Respond with ONLY a JSON object (no markdown, no backticks):
{"isResume": true/false, "confidence": 0-100, "documentType": "resume/invoice/paystub/other"}

Examples of what IS a resume:
- Contains "Experience", "Education", "Skills", "Summary", "Work History"
- Lists job titles, companies, dates, responsibilities
- Professional document meant for job applications

Examples of what is NOT a resume:
- Invoices: contain "Invoice #", "Amount Due", "Line Items", "Total"
- Paystubs: contain "Gross Pay", "Deductions", "Net Pay", "Pay Period"
- Contracts: contain "Agreement", "Parties", "Terms"
- Reports: contain "Report Date", "Summary", financial/technical content`;

      const response = await withTimeout(
        puter.ai.chat([{ role: "user", content: [{ type: "text", text: classificationPrompt }] }], 
          { model: "google/gemini-2.5-flash", stream: false }) as Promise<AIResponse | undefined>,
        30000,
        'validateResume:classification'
      );

      if (!response?.message?.content) {
        return { isResume: false, reason: "Could not classify document" };
      }

      // Parse the classification response
      let classificationText = "";
      const content = response.message.content;
      if (typeof content === 'string') {
        classificationText = content;
      } else if (Array.isArray(content) && content.length > 0) {
        const first = content[0];
        classificationText = first.text ?? first.content ?? JSON.stringify(first);
      }

      // Extract JSON from response
      const jsonMatch = classificationText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { isResume: false, reason: "Invalid classification response" };
      }

      const classification = JSON.parse(jsonMatch[0]);
      
      if (!classification.isResume) {
        return { 
          isResume: false, 
          reason: `This appears to be a ${classification.documentType || 'non-resume document'}, not a resume.` 
        };
      }

      return { isResume: true };
    } catch (err) {
      console.error('Resume validation error:', err);
      return { isResume: false, reason: `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}` };
    }
  };

  const getKV = async (key: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.kv.get(key), 5000, 'kv.get');
  };

  const setKV = async (key: string, value: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.kv.set(key, value), 5000, 'kv.set');
  };

  const deleteKV = async (key: string) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return withTimeout(puter.kv.delete(key), 5000, 'kv.delete');
  };

  const listKV = async (pattern: string, returnValues?: boolean) => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    if (returnValues === undefined) {
      returnValues = false;
    }
    return withTimeout(puter.kv.list(pattern, returnValues), 5000, 'kv.list');
  };

  const flushKV = async () => {
    const puter = getPuter();
    if (!puter) {
      setError("Puter.js not available");
      return;
    }
    return puter.kv.flush();
  };

  return {
    isLoading: true,
    error: null,
    puterReady: false,
    auth: {
      user: null,
      isAuthenticated: false,
      signIn,
      signOut,
      refreshUser,
      checkAuthStatus,
      getUser: () => get().auth.user,
    },
    fs: {
      write: (path: string, data: string | File | Blob) => write(path, data),
      read: (path: string) => readFile(path),
      readDir: (path: string) => readDir(path),
      upload: (files: File[] | Blob[]) => upload(files),
      delete: (path: string) => deleteFile(path),
    },
    ai: {
      chat: (
        prompt: string | ChatMessage[],
        imageURL?: string | PuterChatOptions,
        testMode?: boolean,
        options?: PuterChatOptions
      ) => chat(prompt, imageURL, testMode, options),
      feedback: (path: string, message: string) => feedback(path, message),
      img2txt: (image: string | File | Blob, testMode?: boolean) =>
        img2txt(image, testMode),
      validateResume: (imageFile: File | Blob) => validateResume(imageFile),
    },
    kv: {
      get: (key: string) => getKV(key),
      set: (key: string, value: string) => setKV(key, value),
      delete: (key: string) => deleteKV(key),
      list: (pattern: string, returnValues?: boolean) =>
        listKV(pattern, returnValues),
      flush: () => flushKV(),
    },
    init,
    clearError: () => set({ error: null }),
  };
});