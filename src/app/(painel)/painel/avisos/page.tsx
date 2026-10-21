import { Suspense } from "react";
import type { Metadata } from "next";
import { BellRing } from "lucide-react";

import { NotificationSettingsForm } from "@/components/painel/notification-settings";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { parseBookingFields } from "@/lib/booking-fields";
import { formatPhone } from "@/lib/format";
import { parseStaffChannels } from "@/lib/notifications/channels";
import { emailConfigured } from "@/lib/notifications/email";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Avisos e lembretes" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        icon={BellRing}
        title="Avisos e lembretes"
        description="Por onde a equipe fica sabendo que um paciente precisa de atendimento, e por onde os pacientes recebem o lembrete do horário."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const { supabase, clinic } = await getPanelContext();
  const [{ data, error }, { data: integration }] = await Promise.all([
    supabase
      .from("clinics")
      .select(
        "staff_alert_channels, staff_phone_number, staff_alert_email, reminder_by_email, booking_fields",
      )
      .eq("id", clinic.id)
      .single(),
    supabase
      .from("integrations")
      .select("reminder_hours_before")
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  return (
    <PanelCard>
      <NotificationSettingsForm
        initial={{
          channels: parseStaffChannels(data.staff_alert_channels),
          phone: data.staff_phone_number
            ? formatPhone(data.staff_phone_number)
            : "",
          email: data.staff_alert_email ?? "",
          reminderByEmail: data.reminder_by_email,
        }}
        emailReady={emailConfigured()}
        bookingAsksEmail={
          parseBookingFields(data.booking_fields).email !== "desligado"
        }
        remindersOn={(integration?.reminder_hours_before ?? 0) > 0}
      />
    </PanelCard>
  );
}
