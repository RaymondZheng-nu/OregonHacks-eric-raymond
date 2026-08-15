import { createClient } from "@/lib/supabase/client";

export async function uploadSpotPhoto(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("spot-photos")
    .upload(path, file);

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from("spot-photos").getPublicUrl(path);
  return data.publicUrl;
}
