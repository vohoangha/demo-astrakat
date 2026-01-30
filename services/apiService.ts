
import { User } from "../types";

// Lấy URL Script chính (Login, Transaction, Avatar)
const SCRIPT_URL = (import.meta as any).env?.VITE_GOOGLE_SCRIPT_URL;

// Lấy URL Script riêng cho việc lưu ảnh Output (Storage)
const STORAGE_SCRIPT_URL = (import.meta as any).env?.VITE_STORAGE_SCRIPT_URL;

// MÃ BẢO MẬT (Phải khớp với biến APP_SECRET trong Google Apps Script)
// Bạn nên đặt trong file .env, ví dụ: VITE_APP_SECRET=astra_secure_key_2024
const APP_SECRET = (import.meta as any).env?.VITE_APP_SECRET || "astra_secure_key_2024";

if (!SCRIPT_URL) {
  console.warn("Warning: VITE_GOOGLE_SCRIPT_URL is missing. User features will fail.");
}

if (!STORAGE_SCRIPT_URL) {
  console.warn("Warning: VITE_STORAGE_SCRIPT_URL is missing. Generated images won't be saved to Drive.");
}

// Helper to handle error messages centrally
const handleApiError = (data: any) => {
    if (data.error) {
        // Change specific error text as requested
        if (data.error === "Unauthorized: Invalid App Secret") {
            throw new Error("Unauthorized: Invalid (500)");
        }
        throw new Error(data.error);
    }
};

export const apiService = {
  /**
   * Đăng nhập: Gửi username/pass lên Script chính
   */
  login: async (username: string, password: string): Promise<User> => {
    if (!SCRIPT_URL) throw new Error("Server configuration error: Missing Main Script URL");

    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: 'login',
          appSecret: APP_SECRET, // Gửi kèm mã bảo mật
          username,
          password
        })
      });
      
      const data = await response.json();
      handleApiError(data);

      return {
        username: data.username,
        credits: parseInt(data.credits) || 0,
        avatarUrl: data.avatarUrl || '',
      };
    } catch (error) {
      console.error("Login API Error:", error);
      throw error;
    }
  },

  /**
   * Ghi giao dịch: Trừ tiền (amount âm) hoặc cộng tiền (Script chính)
   */
  logTransaction: async (username: string, description: string, amount: number): Promise<{ success: boolean; newBalance: number }> => {
    if (!SCRIPT_URL) return { success: true, newBalance: 999 }; 

    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: 'log_transaction',
          appSecret: APP_SECRET, // Gửi kèm mã bảo mật
          username,
          description,
          amount
        })
      });

      const data = await response.json();
      handleApiError(data);
      
      return { success: true, newBalance: data.credits };
    } catch (error) {
      console.error("Transaction Error:", error);
      throw error;
    }
  },

  /**
   * Upload Avatar: Gửi ảnh base64 lên Script chính
   */
   uploadAvatar: async (username: string, base64Image: string): Promise<string> => {
      if (!SCRIPT_URL) throw new Error("Missing Main Script URL");

      const response = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
              action: "upload_avatar",
              appSecret: APP_SECRET, // Gửi kèm mã bảo mật
              username: username,
              image: base64Image, 
              filename: `avatar_${username}_${Date.now()}.png`
          })
      });

      const data = await response.json();
      handleApiError(data);
      return data.url;
   },

   /**
    * Cập nhật URL Avatar vào Sheet User
    */
   updateUserAvatar: async (username: string, avatarUrl: string): Promise<boolean> => {
      if (!SCRIPT_URL) return false;
      
      try {
          await fetch(SCRIPT_URL, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({
                  action: "update_avatar_url",
                  appSecret: APP_SECRET, // Gửi kèm mã bảo mật
                  username: username,
                  avatarUrl: avatarUrl
              })
          });
          return true;
      } catch (e) {
          console.error("Failed to update avatar in sheet", e);
          return false;
      }
   },

   /**
    * Upload Generated Image: Lưu ảnh kết quả vào Drive (Script Storage riêng)
    */
   uploadGeneratedImage: async (username: string, base64Image: string, promptText: string, isEdit: boolean = false) => {
      if (!STORAGE_SCRIPT_URL) return;

      const prefix = "AstraEK";
      const d = new Date();
      const dateStr = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
      const id = Math.random().toString(36).substr(2, 6).toUpperCase();
      
      const cleanPrompt = (promptText || "Design").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s-]/g, "").trim();
      const slug = cleanPrompt.split(/\s+/).slice(0, 5).join('-');
      
      const filename = isEdit 
        ? `${prefix}_Edit_${dateStr}_${id}.png`
        : `${prefix}_${slug}_${dateStr}_${id}.png`;

      try {
        await fetch(STORAGE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "upload_image",
                // Storage script thường đơn giản nên có thể không cần secret, 
                // hoặc bạn có thể thêm logic tương tự bên storage script nếu muốn.
                username: username,
                image: base64Image, 
                filename: filename,
                prompt: promptText
            })
        });
      } catch (e) {
        console.error("Background upload to Storage Script failed", e);
      }
   }
};
