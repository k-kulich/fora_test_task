export const validateName = (name) => {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Имя не может быть пустым' };
  if (trimmed.length > 30) return { valid: false, error: 'Имя слишком длинное (макс. 30 символов)' };
  if (!/^[a-zA-Zа-яА-Я0-9 _-]+$/.test(trimmed)) {
    return { valid: false, error: 'Недопустимые символы (разрешены буквы, цифры, пробел, -, _)' };
  }
  return { valid: true, sanitized: trimmed };
};

export const validateRoomName = (name) => {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Название комнаты не может быть пустым' };
  return { valid: true, sanitized: trimmed };
};