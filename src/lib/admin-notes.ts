export type PrivateAttendanceNote = { attendance_id: string; note: string; author_name: string; updated_at: string };

export function noteForRecord(notes: PrivateAttendanceNote[], attendanceId: string) {
  return notes.find((note) => note.attendance_id === attendanceId);
}